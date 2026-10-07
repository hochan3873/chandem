// 랑방 대전 — 진상 기술 연출 (10/08 진상 리메이크 · 코드 그림)
//  sim.js 이벤트: castWind(멤버를 노리는 예고) · castBreak(끊김) · doorWind/doorKick(입구 큰 한 방) · heroHit(멤버가 맞음) · bump(돌진 들이받기)
//  · bossWind/bossSkill 의 새 기술 (volley 던지기 · charm 홀림 · door 입구 강타 · heal 회복)
//  표적은 중요한 것만 크게 (정예 · 중간 보스 · 보스) — 졸개는 작고 옅게 (화면이 어지럽지 않게)
//  game.js 가 onEvent() 로 넘기고 · render.js 가 층마다 draw(layer, g) · 진상 투척물은 drawEproj(q)
import { EST } from './data.js';

const TAU = Math.PI * 2;
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const eOut = (k) => 1 - (1 - k) * (1 - k);
const FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const colOf = (st) => (EST[st] && EST[st].color) || '#ff5a4f';
const iconOf = (st) => (EST[st] && EST[st].icon) || '!';

export class EnemyFx {
  constructor(R) { this.R = R; this.list = []; this.marks = new Map(); this.g = null; this.seenBoss = {}; }
  get cx() { return this.R.cx; }
  get fx() { return this.R.fx; }
  now() { return this.fx.time; }
  reset(g) { if (g !== this.g) { this.list.length = 0; this.marks.clear(); this.g = g; this.seenBoss = {}; } }
  add(kind, o) { o.kind = kind; o.t0 = this.now(); this.list.push(o); if (this.list.length > 80) this.list.shift(); return o; }
  mark(key, o) { o.t0 = this.now(); this.marks.set(key, o); if (this.marks.size > 40) this.marks.delete(this.marks.keys().next().value); }

  onEvent(g, e, busy) {
    this.reset(g);
    const fx = this.fx;
    switch (e.type) {
      case 'castWind':
        if (busy && !e.big) break; // 바쁠 땐 졸개 표적은 생략
        this.mark(e.uid, { kind: 'aim', hero: e.hero, hx: e.hx, hy: e.hy, ex: e.x, ey: e.y, st: e.st, dur: e.sec, big: e.big });
        if (e.big && e.name) fx.text(e.x, e.y - 14, e.name, colOf(e.st), 12, Math.min(1.2, e.sec + 0.3), -10);
        break;
      case 'doorWind':
        this.mark(e.uid, { kind: 'door', x: e.x, y: e.y, ex: e.ex, ey: e.ey, dur: e.sec, big: true });
        fx.text(e.ex, e.ey - 14, e.name ? `${e.name}…` : '쾅 준비…', '#ff8a7a', 12, e.sec + 0.2, -10);
        break;
      case 'castBreak':
        this.marks.delete(e.uid);
        for (const k of [...this.marks.keys()]) if (String(k).startsWith(e.uid + '_')) this.marks.delete(k);
        fx.text(e.x, e.y - 6, e.boss ? `${e.name || '기술'} 끊김!` : '끊김!', '#9dffb0', e.boss ? 16 : 13, 0.9, -16);
        fx.burst(e.x, e.y + 10, busy ? 4 : 9, '#c8ffd8', 130, 'star', 5, 0.45);
        break;
      case 'doorKick':
        this.add('crack', { x: e.x, y: e.y, dur: 0.9 });
        fx.addShake(5); fx.text(e.x, e.y - 40, e.name ? `${e.name}! 쾅!` : '쾅!', '#ff6a5a', 15, 0.9, -12);
        fx.burst(e.x, e.y, busy ? 6 : 14, '#d8b08a', 170, 'shard', 5, 0.55, 300);
        break;
      case 'heroHit': {
        const c = colOf(e.st);
        if (e.block) { if (!busy) fx.text(e.x, e.y - 64, '막음!', '#9fd8ff', 12, 0.7); break; }
        fx.burst(e.x, e.y - 34, busy ? 4 : 10, c, 140, e.st === 'poison' ? 'dot' : 'star', 5, 0.5);
        if (e.st && EST[e.st]) fx.text(e.x, e.y - 70, `${EST[e.st].name}!`, c, 13, 0.9);
        this.add('hitring', { x: e.x, y: e.y + 14, col: c, dur: 0.45 });
        const hh = g.heroes.find((x) => x.id === e.hero); if (hh) hh._hitAt = performance.now();
        break;
      }
      case 'bump': {
        if (!busy) fx.text(e.x, e.y - 62, '쿵!', '#ffb08a', 12, 0.6);
        fx.burst(e.x, e.y - 24, busy ? 3 : 6, '#ffffff', 120, 'star', 4, 0.35);
        const hh = g.heroes.find((x) => x.id === e.hero); if (hh) hh._hitAt = performance.now();
        break;
      }
      case 'bossWind': {
        const big = !e.mid;
        if (e.kind === 'volley' || e.kind === 'charm') {
          const st = e.kind === 'charm' ? 'charm' : e.st;
          (e.targets || []).forEach((q, i) => this.mark(e.uid + '_' + i, { kind: 'aim', hero: q.id, hx: q.x, hy: q.y, ex: e.x, ey: e.y, st, dur: e.sec || 1, big: true, boss: big }));
          this.add('aura', { x: e.x, y: e.y + 40, r: big ? 90 : 60, col: colOf(st), dur: e.sec || 1 });
        } else if (e.kind === 'door') {
          this.mark(e.uid + '_d', { kind: 'door', x: Math.max(40, Math.min(320, e.ex)), y: e.ropeY, ex: e.x, ey: e.y, dur: e.sec || 1, big: true, wide: big ? 70 : 50 });
          this.add('aura', { x: e.x, y: e.y + 40, r: big ? 90 : 60, col: '#ff5a4f', dur: e.sec || 1 });
        } else if (e.kind === 'heal') this.add('aura', { x: e.x, y: e.y + 40, r: e.r || 160, col: '#7dff9a', dur: e.sec || 1 });
        break;
      }
      case 'bossSkill':
        if (e.kind === 'door' && e.door) { this.add('crack', { x: e.door.x, y: e.door.y, dur: 1.1, big: true }); this.add('shock', { x: e.x, y: e.y, tx: e.door.x, ty: e.door.y, dur: 0.5 }); fx.addShake(e.mid ? 5 : 8); fx.text(e.door.x, e.door.y - 50, `${e.name}!`, '#ff6a5a', e.mid ? 14 : 17, 1.0, -14); fx.burst(e.door.x, e.door.y, busy ? 8 : 18, '#d8b08a', 200, 'shard', 6, 0.6, 320); }
        else if (e.kind === 'heal') { this.add('healring', { x: e.x, y: e.y, r: e.r || 160, dur: 0.8 }); fx.text(e.x, e.y - 40, `${e.name}! 회복`, '#7dff9a', 14, 1.0, -14); }
        else if (e.kind === 'charm') { for (const q of e.hits || []) this.add('heartfly', { x: e.x, y: e.y - 40, tx: q.x, ty: q.y - 40, dur: 0.5 }); fx.text(e.x, e.y - 40, `${e.name}!`, '#ff6fb5', 14, 1.0, -14); }
        else if (e.kind === 'volley') fx.text(e.x, e.y - 40, `${e.name}!`, colOf(e.st), 14, 0.9, -14);
        break;
      case 'bossRage':
        if (e.type && !this.seenBoss[e.type]) this.seenBoss[e.type] = 1;
        break;
    }
  }

  draw(layer, g) {
    this.reset(g);
    const now = this.now(), cx = this.cx, R = this.R;
    if (layer === 'ground') {
      for (const [key, m] of this.marks) {
        const k = (now - m.t0) / m.dur;
        if (k > 1.05) { this.marks.delete(key); continue; }
        if (m.kind === 'aim') this.drawAim(g, m, c01(k), now);
        else if (m.kind === 'door') this.drawDoor(m, c01(k), now);
      }
    }
    for (const o of this.list) {
      const k = (now - o.t0) / o.dur;
      if (k < 0 || k > 1) continue;
      const f = this['d_' + o.kind];
      if (f && f.layer === layer) f.call(this, o, k);
    }
    if (layer === 'top') {
      for (const m of this.marks.values()) if (m.kind === 'aim' && m.big) this.drawArc(g, m, c01((now - m.t0) / m.dur)); // 노리는 선 (중요한 것만)
      this.list = this.list.filter((o) => now - o.t0 <= o.dur);
    }
    R.world(); cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over'; cx.setLineDash([]);
  }
  heroPos(g, m) { const h = m.hero && g.heroes.find((x) => x.id === m.hero); return h ? [h.x, h.y] : [m.hx, m.hy]; }
  // 멤버 발밑 표적: 바깥 고리가 조여 들고 안이 차오른다 (다 차면 날아온다) · 상태이상 색 · 머리 위 작은 표시
  drawAim(g, m, k, now) {
    const cx = this.cx, R = this.R, [x, y] = this.heroPos(g, m), c = colOf(m.st), s = m.big ? 1 : 0.7;
    R.tf(x, y + 14, 0, 1, 0.42);
    cx.globalAlpha = (m.big ? 0.85 : 0.55) * (k > 0.95 ? (1.05 - k) * 10 : 1);
    cx.strokeStyle = c; cx.lineWidth = m.big ? 4 : 2.5;
    const r0 = 46 * s, r1 = 22 * s, r = r0 - (r0 - r1) * eOut(k);
    cx.setLineDash([8, 6]); cx.lineDashOffset = -now * 40; cx.beginPath(); cx.arc(0, 0, r, 0, TAU); cx.stroke(); cx.setLineDash([]);
    cx.globalAlpha *= 0.45; cx.fillStyle = c; cx.beginPath(); cx.arc(0, 0, r1 * (0.3 + 0.7 * k), 0, TAU); cx.fill();
    if (m.big) { // 머리 위 상태이상 표시 (깜빡)
      R.tf(x, y - 104 - Math.sin(now * 8) * 2, 0, 1, 1);
      cx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(now * 10));
      cx.fillStyle = 'rgba(20,8,24,0.8)'; cx.beginPath(); cx.arc(0, 0, 10, 0, TAU); cx.fill();
      cx.strokeStyle = c; cx.lineWidth = 2; cx.stroke();
      cx.font = `900 12px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = c; cx.fillText(iconOf(m.st), 0, 1);
    }
  }
  drawArc(g, m, k) {
    const cx = this.cx, [x, y] = this.heroPos(g, m), c = colOf(m.st);
    this.R.world(); cx.globalAlpha = 0.35 * (1 - k * 0.5); cx.strokeStyle = c; cx.lineWidth = 2; cx.setLineDash([4, 6]);
    cx.beginPath(); cx.moveTo(m.ex, m.ey); cx.quadraticCurveTo((m.ex + x) / 2, Math.min(m.ey, y) - 60, x, y - 30); cx.stroke(); cx.setLineDash([]);
  }
  // 입구 큰 한 방 예고: 입구 줄에 빨간 띠가 깜빡이며 차오른다
  drawDoor(m, k, now) {
    const cx = this.cx, w = m.wide || 46;
    this.R.world(); cx.globalCompositeOperation = 'lighter';
    const a = (0.35 + 0.35 * Math.abs(Math.sin(now * 14))) * (k > 0.95 ? (1.05 - k) * 10 : 1);
    const gr = cx.createLinearGradient(m.x - w, 0, m.x + w, 0); gr.addColorStop(0, 'rgba(255,60,40,0)'); gr.addColorStop(0.5, `rgba(255,70,50,${a})`); gr.addColorStop(1, 'rgba(255,60,40,0)');
    cx.fillStyle = gr; cx.fillRect(m.x - w, m.y - 10, w * 2, 20);
    cx.fillStyle = `rgba(255,120,90,${a})`; cx.fillRect(m.x - w * k, m.y + 9, w * 2 * k, 3);
    cx.globalCompositeOperation = 'source-over';
    this.R.tf(m.x, m.y - 26, 0, 1, 1); cx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(now * 10));
    cx.font = `900 18px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.lineWidth = 3; cx.strokeStyle = '#3a0808'; cx.strokeText('!', 0, 0); cx.fillStyle = '#ff5a4f'; cx.fillText('!', 0, 0);
  }

  // 진상 투척물 (코드 그림) — true 면 원래 그림은 안 그린다
  drawEproj(q) {
    const cx = this.cx, R = this.R, t = q.t || 0;
    const spin = (r) => R.tf(q.x, q.y, t * r, 1, 1);
    switch (q.kind) {
      case 'bottle':
        spin(14); cx.fillStyle = '#3bbf5a'; cx.strokeStyle = '#0e4a1e'; cx.lineWidth = 1.5; cx.beginPath(); cx.roundRect ? cx.roundRect(-5, -6, 10, 16, 3) : cx.rect(-5, -6, 10, 16); cx.fill(); cx.stroke(); cx.fillRect(-2, -12, 4, 7); cx.fillStyle = '#fff'; cx.fillRect(-4, 0, 8, 4); return true;
      case 'puke': { // 토 덩어리 (철퍽)
        R.tf(q.x, q.y, 0, 1 + Math.sin(t * 30) * 0.12, 1 - Math.sin(t * 30) * 0.12);
        cx.fillStyle = '#b8d84a'; cx.beginPath(); cx.arc(0, 0, 8, 0, TAU); cx.arc(6, 3, 5, 0, TAU); cx.arc(-6, 4, 4, 0, TAU); cx.fill();
        cx.fillStyle = '#e8f07a'; cx.beginPath(); cx.arc(-2, -3, 3, 0, TAU); cx.fill(); return true;
      }
      case 'latte': spin(6); cx.fillStyle = '#fff4e0'; cx.strokeStyle = '#6a4020'; cx.lineWidth = 1.5; cx.fillRect(-7, -6, 14, 13); cx.strokeRect(-7, -6, 14, 13); cx.fillStyle = '#a06a3a'; cx.fillRect(-6, -5, 12, 3); cx.beginPath(); cx.arc(9, 0, 4, -1.2, 1.2); cx.stroke(); return true;
      case 'star': spin(10); star(cx, 0, 0, 11, 5, '#ffe14d', '#8a6a00'); return true;
      case 'flash': spin(4); star(cx, 0, 0, 12, 4, '#ffffff', '#fff4b0'); cx.globalCompositeOperation = 'lighter'; cx.fillStyle = 'rgba(255,255,220,0.5)'; cx.beginPath(); cx.arc(0, 0, 14, 0, TAU); cx.fill(); cx.globalCompositeOperation = 'source-over'; return true;
      case 'golf': spin(16); cx.fillStyle = '#ffffff'; cx.strokeStyle = '#6a6a6a'; cx.lineWidth = 1; cx.beginPath(); cx.arc(0, 0, 6, 0, TAU); cx.fill(); cx.stroke(); cx.fillStyle = '#c8c8c8'; for (let i = 0; i < 5; i++) { cx.beginPath(); cx.arc(Math.cos(i * 1.3) * 3, Math.sin(i * 1.3) * 3, 0.9, 0, TAU); cx.fill(); } return true;
      case 'bag': spin(8); cx.fillStyle = '#c0306a'; cx.strokeStyle = '#4a0820'; cx.lineWidth = 1.5; cx.fillRect(-9, -5, 18, 13); cx.strokeRect(-9, -5, 18, 13); cx.beginPath(); cx.arc(0, -5, 5, Math.PI, 0); cx.stroke(); cx.fillStyle = '#ffd23f'; cx.fillRect(-2, -1, 4, 3); return true;
      case 'stamp': spin(9); cx.fillStyle = '#d8202a'; cx.fillRect(-7, -2, 14, 8); cx.fillStyle = '#7a3a1a'; cx.fillRect(-3, -11, 6, 9); cx.beginPath(); cx.arc(0, -12, 4, 0, TAU); cx.fill(); return true;
      case 'glow': spin(12); cx.globalCompositeOperation = 'lighter'; cx.fillStyle = 'rgba(120,255,200,0.55)'; cx.fillRect(-3, -13, 6, 26); cx.fillStyle = '#e8fff6'; cx.fillRect(-1.5, -11, 3, 22); cx.globalCompositeOperation = 'source-over'; return true;
      case 'sarcasm': spin(18); cx.strokeStyle = '#b58cff'; cx.lineWidth = 4; cx.lineCap = 'round'; cx.beginPath(); cx.arc(0, 0, 8, -0.2, Math.PI * 0.9); cx.stroke(); return true;
      case 'rumor': R.tf(q.x, q.y, Math.sin(t * 14) * 0.15, 1, 1); cx.fillStyle = '#f2ecff'; cx.strokeStyle = '#7a5ac8'; cx.lineWidth = 1.5; cx.beginPath(); cx.ellipse(0, 0, 13, 8, 0, 0, TAU); cx.fill(); cx.stroke(); cx.font = `900 7px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = '#5a3aa0'; cx.fillText('수군', 0, 0.5); return true;
      case 'paper': return false; // (원래 차용증 그림)
      default: return false;
    }
  }
}
function star(cx, x, y, r, r2, fill, stroke) {
  cx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r2 : r; cx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  cx.closePath(); cx.fillStyle = fill; cx.fill(); if (stroke) { cx.strokeStyle = stroke; cx.lineWidth = 1.2; cx.stroke(); }
}

// ── 짧은 연출 (list) ──
const P = EnemyFx.prototype;
const def = (name, layer, f) => { f.layer = layer; P['d_' + name] = f; };
def('crack', 'ground', function (o, k) { // 입구가 쩍 갈라진 자국
  const cx = this.cx; this.R.world(); cx.globalAlpha = 1 - k; cx.strokeStyle = '#3a1808'; cx.lineWidth = o.big ? 4 : 3;
  const w = o.big ? 60 : 40; cx.beginPath();
  for (let i = 0; i < 5; i++) { const a = -Math.PI + (i / 4) * Math.PI; cx.moveTo(o.x, o.y); cx.lineTo(o.x + Math.cos(a) * w * (0.6 + (i % 2) * 0.4), o.y + Math.sin(a) * 18 * (0.6 + (i % 3) * 0.3)); }
  cx.stroke();
  cx.globalCompositeOperation = 'lighter'; cx.strokeStyle = `rgba(255,110,70,${0.6 * (1 - k)})`; cx.lineWidth = 8; cx.beginPath(); cx.ellipse(o.x, o.y, w * eOut(k), 14 * eOut(k), 0, 0, TAU); cx.stroke(); cx.globalCompositeOperation = 'source-over';
});
def('shock', 'mid', function (o, k) { // 보스 → 입구로 달리는 충격선
  const cx = this.cx; this.R.world(); cx.globalAlpha = 1 - k; cx.strokeStyle = '#ff7a5a'; cx.lineWidth = 6 * (1 - k) + 2; cx.lineCap = 'round';
  const q = eOut(Math.min(1, k * 2)); cx.beginPath(); cx.moveTo(o.x, o.y); cx.lineTo(o.x + (o.tx - o.x) * q, o.y + (o.ty - o.y) * q); cx.stroke();
});
def('aura', 'ground', function (o, k) { // 기술 예고: 보스 발밑 색 기운
  const cx = this.cx; this.R.tf(o.x, o.y, 0, 1, 0.4); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.35 + 0.25 * Math.sin(k * Math.PI * 4);
  cx.strokeStyle = o.col; cx.lineWidth = 6; cx.beginPath(); cx.arc(0, 0, o.r * (0.5 + 0.5 * k), 0, TAU); cx.stroke(); cx.globalCompositeOperation = 'source-over';
});
def('healring', 'ground', function (o, k) { const cx = this.cx; this.R.tf(o.x, o.y, 0, 1, 0.45); cx.globalAlpha = 1 - k; cx.strokeStyle = '#7dff9a'; cx.lineWidth = 6; cx.beginPath(); cx.arc(0, 0, o.r * eOut(k), 0, TAU); cx.stroke(); });
def('hitring', 'ground', function (o, k) { const cx = this.cx; this.R.tf(o.x, o.y, 0, 1, 0.42); cx.globalAlpha = 1 - k; cx.strokeStyle = o.col; cx.lineWidth = 4; cx.beginPath(); cx.arc(0, 0, 14 + 26 * eOut(k), 0, TAU); cx.stroke(); });
def('heartfly', 'top', function (o, k) { // 홀림: 보스에게서 멤버로 하트가 날아간다
  const cx = this.cx, q = eOut(k), x = o.x + (o.tx - o.x) * q, y = o.y + (o.ty - o.y) * q - Math.sin(q * Math.PI) * 50;
  this.R.tf(x, y, 0, 1 + 0.3 * Math.sin(k * 20), 1 + 0.3 * Math.sin(k * 20)); cx.globalAlpha = 1;
  cx.fillStyle = '#ff4f9a'; cx.beginPath(); cx.moveTo(0, 6); cx.bezierCurveTo(-12, -4, -6, -12, 0, -5); cx.bezierCurveTo(6, -12, 12, -4, 0, 6); cx.fill();
});
