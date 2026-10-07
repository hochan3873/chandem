// 랑방 대전 — 할로윈 이벤트 전투 연출 (render.js 훅 R.hwDraw · game.js 이벤트 → hwEvent)
//  맵 분위기: 골목 낙엽 · 술집 불빛 깜빡임 · 묘지 안개 · 축제 도깨비불 + 보름달
//  진상 기술: 귀신 잔상 · 좀비 묘비(다시 일어나기) · 저승사자 명부(멤버 머리 위 초 읽기) · 박쥐 떼 변신 · 호박 폭탄 · 마녀 물약 · 독 웅덩이 예고
//  움직임 줄이기(body.rm): 떨어지는 · 떠다니는 것은 멈춘 그림만 (깜빡임 없음)
const TAU = Math.PI * 2;
const S = { amb: [], ghosts: [], bats: [], tombs: [], pops: [], warns: [], moonA: 0, flick: 0, flickT: 0, seed: 1 };
const rnd = () => { S.seed = (S.seed * 16807) % 2147483647; return S.seed / 2147483647; };
const rmOn = () => typeof document !== 'undefined' && document.body && document.body.classList.contains('rm');
export function resetHwFx() { S.amb.length = 0; S.ghosts.length = 0; S.bats.length = 0; S.tombs.length = 0; S.pops.length = 0; S.warns.length = 0; S.moonA = 0; S.flick = 0; S.flickT = 2; S.last = 0; }

function ambInit(kind, W, H) {
  S.amb.length = 0; S.kind = kind;
  const n = kind === 'leaves' ? 16 : kind === 'wisps' ? 12 : kind === 'fog' ? 6 : 8;
  for (let i = 0; i < n; i++) S.amb.push({ x: rnd() * W, y: rnd() * H, s: 0.6 + rnd() * 0.8, p: rnd() * TAU, v: 0.5 + rnd() });
}
function leaf(cx, x, y, s, rot, col) {
  cx.save(); cx.translate(x, y); cx.rotate(rot); cx.scale(s, s);
  cx.fillStyle = col; cx.beginPath(); cx.moveTo(0, -7); cx.quadraticCurveTo(6, -3, 0, 7); cx.quadraticCurveTo(-6, -3, 0, -7); cx.fill();
  cx.strokeStyle = 'rgba(60,20,0,0.5)'; cx.lineWidth = 0.8; cx.beginPath(); cx.moveTo(0, -6); cx.lineTo(0, 6); cx.stroke();
  cx.restore();
}
function wisp(cx, x, y, r, a, col) {
  const g = cx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${0.9 * a})`); g.addColorStop(0.35, col.replace('A', String(0.55 * a))); g.addColorStop(1, col.replace('A', '0'));
  cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, TAU); cx.fill();
}
function batShape(cx, x, y, s, flap, col) {
  cx.save(); cx.translate(x, y); cx.scale(s, s);
  cx.fillStyle = col; cx.beginPath();
  const f = Math.sin(flap) * 5;
  cx.moveTo(0, 0); cx.quadraticCurveTo(-6, -6 - f, -13, -2 - f); cx.quadraticCurveTo(-10, 1, -8, 3); cx.quadraticCurveTo(-5, 1, -3, 4); cx.lineTo(0, 2);
  cx.lineTo(3, 4); cx.quadraticCurveTo(5, 1, 8, 3); cx.quadraticCurveTo(10, 1, 13, -2 - f); cx.quadraticCurveTo(6, -6 - f, 0, 0); cx.fill();
  cx.beginPath(); cx.arc(0, 0, 3, 0, TAU); cx.fill();
  cx.restore();
}
function pumpkinIcon(cx, x, y, r) {
  cx.fillStyle = '#ff8a1f'; cx.strokeStyle = '#7a3500'; cx.lineWidth = 1.2;
  for (const dx of [-0.45, 0, 0.45]) { cx.beginPath(); cx.ellipse(x + dx * r, y, r * 0.55, r * 0.8, 0, 0, TAU); cx.fill(); cx.stroke(); }
  cx.fillStyle = '#3a6b1f'; cx.fillRect(x - r * 0.08, y - r * 1.05, r * 0.16, r * 0.3);
  cx.fillStyle = '#ffe36a'; cx.beginPath(); cx.moveTo(x - r * 0.4, y - r * 0.2); cx.lineTo(x - r * 0.2, y - r * 0.45); cx.lineTo(x - r * 0.05, y - r * 0.2); cx.fill();
  cx.beginPath(); cx.moveTo(x + r * 0.4, y - r * 0.2); cx.lineTo(x + r * 0.2, y - r * 0.45); cx.lineTo(x + r * 0.05, y - r * 0.2); cx.fill();
  cx.beginPath(); cx.moveTo(x - r * 0.4, y + r * 0.15); cx.quadraticCurveTo(x, y + r * 0.55, x + r * 0.4, y + r * 0.15); cx.quadraticCurveTo(x, y + r * 0.3, x - r * 0.4, y + r * 0.15); cx.fill();
}

// ─── 그리기 (R.hwDraw) ───
export function drawHw(R, g, t, layer) {
  const cx = R.cx, W = R.W, H = R.H, rm = rmOn();
  const dt = Math.min(0.05, Math.max(0, t - (S.last || t))); if (layer === 'back') S.last = t;
  const kind = g.ev ? g.ev.fx : 'leaves';
  if (layer === 'back') {
    if (S.kind !== kind || !S.amb.length) ambInit(kind, W, H);
    R.world && R.world();
    cx.save();
    if (kind === 'fog') { // 묘지: 바닥을 기는 안개 띠
      for (const a of S.amb) {
        if (!rm) a.x += (8 + a.v * 10) * dt;
        if (a.x > W + 160) a.x = -160;
        const y = g.rowY * (0.25 + (a.p / TAU) * 0.6), r = 120 * a.s;
        const gr = cx.createRadialGradient(a.x, y, 0, a.x, y, r);
        gr.addColorStop(0, 'rgba(170,230,200,0.16)'); gr.addColorStop(1, 'rgba(170,230,200,0)');
        cx.fillStyle = gr; cx.fillRect(a.x - r, y - r * 0.4, r * 2, r * 0.8);
      }
    } else if (kind === 'flicker') { // 술집: 가끔 불이 깜빡 (움직임 줄이기면 은은하게 고정)
      if (!rm) { S.flickT -= dt; if (S.flickT <= 0) { S.flick = 0.32; S.flickT = 3 + rnd() * 5; } S.flick = Math.max(0, S.flick - dt * 1.6); }
      for (const a of S.amb) { const x = a.x < W / 2 ? 18 : W - 18, y = 90 + a.p * 70; wisp(cx, x, y, 26, rm ? 0.6 : 0.55 + Math.sin(t * 9 + a.p * 3) * 0.2, 'rgba(255,170,80,A)'); }
    } else if (kind === 'wisps') { // 축제: 위로 떠오르는 도깨비불
      for (const a of S.amb) {
        if (!rm) { a.y -= (14 + a.v * 12) * dt; a.x += Math.sin(t * 1.5 + a.p) * 8 * dt; }
        if (a.y < -20) { a.y = g.rowY + 20; a.x = rnd() * W; }
        wisp(cx, a.x, a.y, 9 * a.s, 0.7, 'rgba(120,200,255,A)');
      }
    } else { // 골목: 떨어지는 낙엽
      for (const a of S.amb) {
        if (!rm) { a.y += (22 + a.v * 18) * dt; a.x += Math.sin(t * 1.3 + a.p) * 18 * dt; }
        if (a.y > g.rowY + 30) { a.y = -10; a.x = rnd() * W; }
        leaf(cx, a.x, a.y, a.s, rm ? a.p : t * a.v * 1.6 + a.p, a.v > 1 ? '#ff8a2a' : '#c0562a');
      }
    }
    // 독 웅덩이 예고 (저주): 멤버 발밑 원이 차오른다
    for (const w of S.warns) {
      w.t -= dt; const k = 1 - Math.max(0, w.t) / w.max;
      cx.strokeStyle = 'rgba(143,232,90,0.9)'; cx.fillStyle = `rgba(143,232,90,${0.12 + 0.25 * k})`; cx.lineWidth = 2;
      cx.beginPath(); cx.ellipse(w.x, w.y, w.r, w.r * 0.42, 0, 0, TAU); cx.fill(); cx.stroke();
      cx.beginPath(); cx.ellipse(w.x, w.y, w.r * k, w.r * 0.42 * k, 0, 0, TAU); cx.stroke();
    }
    S.warns = S.warns.filter((w) => w.t > -0.1);
    cx.restore();
    return;
  }
  if (layer === 'mid') {
    cx.save();
    // 귀신 유령화: 푸른 잔상 꼬리
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (e.hwGhost) {
        if (!rm && (e._gtT = (e._gtT || 0) - dt) <= 0) { e._gtT = 0.07; S.ghosts.push({ x: e.x, y: e.y - e.def.size * 0.4, a: 0.5, r: e.def.size * 0.28 }); }
        wisp(cx, e.x, e.y - e.def.size * 0.4, e.def.size * 0.45, 0.35, 'rgba(160,210,255,A)');
      }
      if (e.hwRiseT > 0) { // 좀비: 묘비가 솟고 흙이 튄다 (일어나는 동안 때리면 끝)
        const k = 1 - e.hwRiseT / e.def.hw.revive.sec;
        cx.fillStyle = '#5a5c66'; cx.strokeStyle = '#26262e'; cx.lineWidth = 1.5;
        const hx = e.x + 18, hy = e.y + e.def.size * 0.05, hh = 26 * Math.min(1, k * 2);
        cx.beginPath(); cx.moveTo(hx - 9, hy); cx.lineTo(hx - 9, hy - hh + 8); cx.quadraticCurveTo(hx, hy - hh - 3, hx + 9, hy - hh + 8); cx.lineTo(hx + 9, hy); cx.closePath(); cx.fill(); cx.stroke();
        cx.fillStyle = '#26262e'; cx.font = 'bold 9px sans-serif'; cx.textAlign = 'center'; if (hh > 16) cx.fillText('RIP', hx, hy - hh + 14);
        cx.strokeStyle = `rgba(143,232,90,${0.5 + 0.4 * Math.sin(t * 12)})`; cx.lineWidth = 3;
        cx.beginPath(); cx.arc(e.x, e.y - e.def.size * 0.25, e.def.size * 0.42, -Math.PI / 2, -Math.PI / 2 + TAU * k); cx.stroke();
      }
      if (e.hwBat > 0) { // 드라큘라 박쥐 변신: 박쥐 떼가 소용돌이
        const n = 14;
        for (let i = 0; i < n; i++) { const a = t * 3 + (i / n) * TAU, rr = 30 + (i % 4) * 14; batShape(cx, e.x + Math.cos(a) * rr, e.y - e.def.size * 0.45 + Math.sin(a * 1.3) * rr * 0.6, 1.1, t * 22 + i, i % 3 ? '#1a0a22' : '#5a1030'); }
      }
      if (e.def.hw && e.def.hw.brew && e.hwBrT !== undefined && e.hwBrT < 1.2 && !e.dead) { // 마녀: 물약 끓는 거품 (예고)
        for (let i = 0; i < 3; i++) wisp(cx, e.x - 14 + i * 10, e.y - e.def.size * 0.55 - ((t * 30 + i * 9) % 22), 4, 0.8, 'rgba(120,255,120,A)');
      }
    }
    for (const q of S.ghosts) { q.a -= dt * 1.6; if (q.a > 0) wisp(cx, q.x, q.y, q.r, q.a, 'rgba(170,215,255,A)'); }
    S.ghosts = S.ghosts.filter((q) => q.a > 0);
    // 저승사자 명부: 멤버 머리 위 두루마리 + 초 읽기 + 팀장에게 이어진 사슬
    for (const k of (g.hw && g.hw.marks) || []) {
      const h = k.h; if (!h || h.gone) continue;
      const x = h.x, y = h.y - 74, f = Math.max(0, k.t / k.max);
      if (k.e && !k.e.dead) { cx.strokeStyle = 'rgba(160,120,255,0.55)'; cx.setLineDash([5, 6]); cx.lineWidth = 2; cx.beginPath(); cx.moveTo(k.e.x, k.e.y - k.e.def.size * 0.6); cx.lineTo(x, y); cx.stroke(); cx.setLineDash([]); }
      cx.fillStyle = 'rgba(20,10,30,0.85)'; cx.beginPath(); cx.arc(x, y, 17, 0, TAU); cx.fill();
      cx.strokeStyle = f < 0.35 ? '#ff4a5a' : '#c9a0ff'; cx.lineWidth = 4; cx.beginPath(); cx.arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * f); cx.stroke();
      cx.fillStyle = '#f2e6c8'; cx.fillRect(x - 8, y - 9, 16, 13); cx.fillStyle = '#7a2030'; for (let i = 0; i < 3; i++) cx.fillRect(x - 6, y - 6 + i * 4, 12 - i * 3, 1.6);
      cx.fillStyle = '#fff'; cx.font = 'bold 11px sans-serif'; cx.textAlign = 'center'; cx.fillText(Math.ceil(k.t).toString(), x, y + 15);
      if (!rm && f < 0.35) { cx.strokeStyle = `rgba(255,70,90,${0.5 + 0.5 * Math.sin(t * 20)})`; cx.lineWidth = 2; cx.beginPath(); cx.arc(x, y, 22, 0, TAU); cx.stroke(); }
    }
    cx.restore();
    return;
  }
  if (layer === 'top') {
    cx.save();
    // 보름달 (드라큘라 25%): 붉은 달빛 + 어두운 테두리
    if (g.hw && g.hw.moon) S.moonA = Math.min(1, S.moonA + dt * 0.8); else S.moonA = Math.max(0, S.moonA - dt);
    if (S.moonA > 0) {
      const gr = cx.createRadialGradient(W * 0.78, 70, 4, W * 0.78, 70, 70);
      gr.addColorStop(0, `rgba(255,220,200,${0.9 * S.moonA})`); gr.addColorStop(0.3, `rgba(255,70,70,${0.55 * S.moonA})`); gr.addColorStop(1, 'rgba(255,40,40,0)');
      cx.fillStyle = gr; cx.beginPath(); cx.arc(W * 0.78, 70, 70, 0, TAU); cx.fill();
      const vg = cx.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.5, H * 0.8);
      vg.addColorStop(0, 'rgba(60,0,10,0)'); vg.addColorStop(1, `rgba(90,0,20,${0.35 * S.moonA})`);
      cx.fillStyle = vg; cx.fillRect(0, 0, W, H);
    }
    // 술집 깜빡임: 화면이 잠깐 어두워짐
    if (S.flick > 0) { cx.fillStyle = `rgba(5,0,15,${S.flick})`; cx.fillRect(0, 0, W, H); }
    // 호박 폭탄 · 큰 펑: 주황 빛 고리
    for (const p of S.pops) { p.t -= dt; const k = 1 - p.t / p.max; cx.strokeStyle = `rgba(255,150,40,${1 - k})`; cx.lineWidth = 6 * (1 - k) + 1; cx.beginPath(); cx.arc(p.x, p.y, p.r * (0.3 + k), 0, TAU); cx.stroke(); }
    S.pops = S.pops.filter((p) => p.t > 0);
    // 의상 투사체 꼬리 (할로윈 의상 입은 멤버)
    const skin = R.skinMap || {};
    if (Object.keys(skin).length && !rm) {
      for (const p of g.projs) {
        const id = p.hero && p.hero.id; if (!id || !skin[id]) continue;
        if (Math.random() < 0.35) { const fx = R.fx; const c = { gunnyeo_hw: 'rgba(140,255,150,0.8)', hochan_hw: 'rgba(255,60,90,0.8)', jieun_hw: 'rgba(190,120,255,0.8)', sunggu_hw: 'rgba(240,225,180,0.8)', ara_hw: 'rgba(255,150,40,0.85)' }[skin[id]] || 'rgba(255,150,40,0.8)'; fx.part(skin[id] === 'ara_hw' ? 'flame' : 'puff', p.x, p.y, (Math.random() - 0.5) * 20, -10, 0.4, 5, c); }
      }
    }
    cx.restore();
  }
}

// ─── 전투 이벤트 → 연출 (game.js 이벤트 루프가 넘겨준다) ───
export function hwEvent(C, g, e, loud) {
  const fx = C.fx, rm = rmOn();
  switch (e.type) {
    case 'hwDown': fx.text(e.x, e.y - 40, '한 잔 더…!', '#9fe870', 13, 1.1); fx.burst(e.x, e.y, 8, '#6a5a40', 90, 'dot', 3, 0.5, 200); break;
    case 'hwRise': fx.text(e.x, e.y - 20, '부활!', '#8fe85a', 15, 1); fx.burst(e.x, e.y, 10, '#8fe85a', 110, 'spark', 4, 0.5); if (loud && C.A.sfx.hit) C.A.sfx.hit(); break;
    case 'hwNoRise': fx.text(e.x, e.y, e.by === 'burn' ? '활활! 못 일어남' : e.by === 'censor' ? '검열! 못 일어남' : '장미! 못 일어남', '#ffd23f', 11, 0.9); break;
    case 'hwDrain': if (!rm) fx.part('heart', e.x, e.y, 0, -40, 0.5, 6, '#c01030'); break;
    case 'hwPhaseIn': fx.burst(e.x, e.y, 10, '#bfe0ff', 70, 'puff', 6, 0.6); fx.text(e.x, e.y - 20, '사라졌다…', '#cfe8ff', 11, 0.8); break;
    case 'hwPhaseOut': fx.burst(e.x, e.y, 8, '#bfe0ff', 60, 'puff', 5, 0.5); if (e.seen) fx.text(e.x, e.y - 20, '들켰다!', '#ffd23f', 12, 0.8); break;
    case 'hwBrew': fx.burst(e.x, e.y, 14, '#7dff7a', 120, 'spark', 4, 0.6); fx.ring(e.x, e.y + 30, 10, e.r, 0.5, '#7dff9a', 3); fx.text(e.x, e.y - 18, '건강 물약!', '#7dff9a', 12, 0.9); break;
    case 'hwRewrap': fx.ring(e.x, e.y, 10, 60, 0.4, '#f2e6c8', 4); fx.text(e.x, e.y - 18, '붕대 재감기!', '#f2e6c8', 12, 0.9); break;
    case 'hwList': fx.text(e.x, e.y - 10, '야근 명부!', '#c9a0ff', 14, 1.2); fx.ring(e.x, e.y + 60, 8, 44, 0.5, '#c9a0ff', 3); if (C.A.sfx.warn) C.A.sfx.warn(); break;
    case 'hwListClear': fx.text(e.x, e.y, e.by === 'shield' ? '명부 삭제!' : '끊었다!', '#7dff9a', 14, 1); fx.burst(e.x, e.y, 12, '#f2e6c8', 120, 'shard', 4, 0.5); break;
    case 'hwListHit': fx.text(e.x, e.y - 70, '강제 퇴근…', '#ff4a5a', 14, 1.2); fx.blast(e.x, e.y - 30, 50, 'electric'); fx.flash('#3a0a4a', 0.25); fx.addShake && fx.addShake(5); break;
    case 'hwBatIn': fx.burst(e.x, e.y, 22, '#1a0a22', 160, 'puff', 8, 0.7); fx.text(e.x, e.y - 30, '박쥐 변신!', '#ff3355', 14, 1); break;
    case 'hwBatOut': fx.burst(e.x, e.y, 18, '#5a1030', 140, 'puff', 7, 0.6); fx.blast(e.x, e.y, 70, 'heart'); break;
    case 'hwMoon': fx.banner('🌕 보름달이 떴다!', '진상 전부 빨라진다 · 박쥐가 살아 있으면 사장이 회복', '#5a0a1a', 2.4, 'big'); fx.flash('#ff3040', 0.35); break;
    case 'hwPuddleWarn': S.warns.push({ x: e.x, y: e.y, r: e.r, t: e.sec, max: e.sec }); break;
    case 'hwPuddle': fx.burst(e.x, e.y, 10, '#8fe85a', 70, 'dot', 4, 0.5, 120); break;
    default: break;
  }
}
// 호박 폭탄 (doorKick · 호박머리) · 호박씨 분열 — game.js 가 기존 이벤트에서 부른다
export function pumpkinPop(C, x, y) { S.pops.push({ x, y, r: 70, t: 0.45, max: 0.45 }); C.fx.blast(x, y, 64, 'fire'); C.fx.burst(x, y, 16, '#ff8a1f', 160, 'flame', 6, 0.6); for (let i = 0; i < 6; i++) C.fx.part('shard', x, y, (Math.random() - 0.5) * 260, -120 - Math.random() * 120, 0.8, 6, '#ff8a1f', { grav: 400 }); }
export { pumpkinIcon, batShape };
