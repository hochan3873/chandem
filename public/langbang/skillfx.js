// 랑방 대전 — 스킬 전용 연출 (캔버스 코드 그림 · 빛은 더하기 합성 · 바닥 효과는 발밑에 납작하게)
//  배현경 다이어트 주사 · 문동한 진심 모드 · 오지은 시간 정지 · 홍정민 붕대 대공사 · 박상화 좋은남자
//  game.js handleEvents 가 add() 로 시작하고, render.js draw() 가 층마다 draw(layer, g) 를 부른다
//   ground: 바닥(진상·멤버 아래) · gate: 입구(바리케이드 위 · 문 때리는 진상 아래) · mid: 캐릭터 위 · top: 입자 위 · 글자 아래 · screen: 화면 전체(카메라 없이)
//  게임 숫자(피해·시간)는 건드리지 않는다 — 그림만. 진상이 많으면(busy) 입자를 줄인다.
//  그림 파일이 있으면 그걸 쓰고(없으면 코드 모양): /img/lb/fx/p_sk_syringe.webp · p_sk_banknote.webp · p_sk_bandage.webp · p_sk_mosaic_hand.webp · p_sk_censor.webp
import { HEROES } from './data.js';

const TAU = Math.PI * 2;
const FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const eOut = (k) => 1 - (1 - k) * (1 - k);
const eIn = (k) => k * k;
const eBack = (k) => { const s = 1.7; k -= 1; return 1 + k * k * ((s + 1) * k + s); };
const imgOk = (im) => !!(im && im.complete && im.naturalWidth > 0);
const HERO_TOP = 50, HERO_FEET = 24; // 멤버 몸 중심(y) 기준 머리 위 · 발 (HERO_BOX 82 기준)

export class SkillFx {
  constructor(R) {
    this.R = R;
    this.list = [];
    this.g = null;
    this.lastT = 0;
  }
  get fx() { return this.R.fx; }
  art(k) { const im = this.R.images && this.R.images['sk_fx_' + k]; return imgOk(im) ? im : null; }
  active(kind) { return this.list.some((o) => o.kind === kind && !o.done); }
  clear() { this.list.length = 0; }
  // 월드 → 화면(카메라 흔들림·확대 반영) 좌표
  scr(x, y) { const R = this.R; return [(R.K * x + R.OX) / R.k, (R.K * y + R.OY) / R.k]; }
  heroOf(g, id) { return g.heroes.find((h) => h.id === id && !h.gone); }

  add(kind, g, e, busy) {
    if (g !== this.g) { this.list.length = 0; this.g = g; }
    const fx = this.fx, now = fx.time;
    const o = { kind, t0: now, st0: g.t, busy: !!busy, done: false };
    if (kind === 'diet') {
      const h = this.heroOf(g, 'hyungyeong');
      o.h = h; o.x = h ? h.x : e.x; o.y = h ? h.y : e.y;
      const n = busy ? 3 : 6;
      const tg = g.enemies.filter((q) => !q.dead && q.y > 40 && q.y < g.ropeY + 10).sort((a, b) => Math.hypot(a.x - o.x, a.y - o.y) - Math.hypot(b.x - o.x, b.y - o.y)).slice(0, n);
      o.drops = tg.map((q, i) => ({ e: q, at: 0.44 + i * 0.06, fl: 0.3, hit: false, tx: q.x, ty: q.y }));
      o.puffs = []; o.sparks = []; o.imp = false;
    } else if (kind === 'serious') {
      const h = this.heroOf(g, 'donghan');
      if (!h) return;
      o.h = h; o.imp = false; o.impT = 0;
      for (const q of this.list) if (q.kind === 'serious') q.done = true;
    } else if (kind === 'timestop') {
      const h = this.heroOf(g, 'jieun');
      const dur = h && h.altT > 0 ? h.altT : 4;
      const old = this.list.find((q) => q.kind === 'timestop' && !q.done && g.t < q.st0 + q.dur - 0.5);
      const frozen = g.enemies.filter((q) => !q.dead && Math.hypot(q.x - e.x, q.y - e.y) <= e.r + (q.r || 14)).slice(0, 40);
      if (old) { // 메아리(진화) 시간 정지: 시계만 하나 더 · 끝나는 시간만 늘림
        old.clocks.push({ x: e.x, y: e.y, r: e.r, t: g.t - old.st0 });
        old.dur = Math.max(old.dur, g.t - old.st0 + dur);
        for (const q of frozen) if (!old.frozen.includes(q)) old.frozen.push(q);
        return;
      }
      o.h = h; o.dur = dur; o.clocks = [{ x: e.x, y: e.y, r: e.r, t: 0 }]; o.frozen = frozen;
      o.ox = h ? h.x : e.x; o.oy = h ? h.y - 20 : e.y;
    } else if (kind === 'bandage') {
      for (const q of this.list) if (q.kind === 'bandage') q.done = true;
      o.v = e.v || 0; o.plus = []; o.tw = []; o.landed = [false, false, false, false];
    } else if (kind === 'mosaic') { // 여지원 모자이크 폭격: 검열 띠 → 거대 모자이크 손 3개가 차례로 쾅
      const h = this.heroOf(g, 'jiwon');
      o.h = h; o.lanes = e.lanes || []; o.wind = e.wind || 0.6; o.gap = e.gap || 0.18; o.echo = !!e.echo;
      o.w = (h && h.sa && h.sa.wide ? 1.5 : 1) * ((HEROES.jiwon.skill && HEROES.jiwon.skill.w) || 30);
      o.ys = o.lanes.map((lx) => { let n = 0, sy = 0; for (const q of g.enemies) if (!q.dead && q.y > 0 && q.y < g.ropeY && Math.abs(q.x - lx) < o.w + 8) { n++; sy += q.y; } return n ? sy / n : g.ropeY - 220; });
      o.hit = o.lanes.map(() => false);
    } else if (kind === 'ydash') {
      const h = this.heroOf(g, 'youngjun');
      if (!h) return;
      o.h = h; o.x = e.x; o.y = e.y;
      this.fx.burst(e.x, e.y + HERO_FEET, busy ? 4 : 9, 'rgba(190,170,150,0.85)', 130, 'puff', 9, 0.45);
    } else if (kind === 'goodman') {
      const h = this.heroOf(g, 'sanghwa');
      o.h = h; o.x = h ? h.x : e.x; o.y = h ? h.y : e.y + 70; o.echo = !!e.echo;
      o.grow = h ? Math.round((h.grow || 0) * 100) : 0; // 지금까지 자란 만큼 (꽃다발 세기)
      o.rain = [];
      const nc = busy ? 12 : 34, nb = busy ? 4 : 12, W = g.W || 360;
      for (let i = 0; i < nc + nb; i++) {
        const bill = i >= nc;
        o.rain.push({ bill, x: 10 + Math.random() * (W - 20), y: -20 - Math.random() * 260, vy: bill ? 110 + Math.random() * 60 : 300 + Math.random() * 140, vx: (Math.random() - 0.5) * (bill ? 50 : 30), sp: (Math.random() * 2 + 4) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * TAU, s: bill ? 1 : 0.8 + Math.random() * 0.45, delay: Math.random() * 0.5 });
      }
      for (const q of this.list) if (q.kind === 'goodman') q.done = true;
    }
    this.list.push(o);
  }

  draw(layer, g) {
    if (!g) return;
    if (g !== this._ysG) { this.ys = []; this._ysG = g; }
    if (layer === 'top' && this.ys && this.ys.length) this.drawYs(g);
    if (!this.list.length) return;
    if (g !== this.g) { this.list.length = 0; this.g = g; return; }
    const R = this.R, cx = R.cx, fx = this.fx;
    if (layer === 'ground') { // 한 프레임에 한 번: 끝난 것 정리
      this.dt = Math.min(0.1, Math.max(0, fx.time - this.lastT)); this.lastT = fx.time;
      this.list = this.list.filter((o) => !o.done);
    }
    cx.save();
    for (const o of this.list) {
      if (o.done) continue;
      const T = fx.time - o.t0;
      try {
        if (layer === 'screen') { cx.setTransform(R.k, 0, 0, R.k, 0, 0); } else R.world();
        cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
        this[o.kind](layer, o, T, g);
      } catch (err) { o.done = true; if (typeof console !== 'undefined') console.warn('skillfx', o.kind, err); }
    }
    cx.restore();
    cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
    if (layer === 'screen') cx.setTransform(R.k, 0, 0, R.k, 0, 0); else R.world();
  }

  // 모자이크 폭격: 실제로 내려친 줄의 진상 위치로 손 자리를 맞춘다 (game.js 'mosaicSlam')
  mosaicSlam(e) {
    for (let i = this.list.length - 1; i >= 0; i--) { const o = this.list[i]; if (o.kind !== 'mosaic' || o.done || o.echo !== !!e.echo) continue; if (e.k >= 0 && e.k < o.ys.length) { if (e.n) o.ys[e.k] = e.y; o.hit[e.k] = true; } return; }
  }
  // 손 그림: 새 그림(p_sk_mosaic_hand · 아래로 내려치는 손)이 있으면 그것 · 없으면 평타 모자이크 손(w_mosaic · 오른쪽을 보는 주먹)을 90° 돌려 아래로
  mosaicHand(x, y, s, a, sq) {
    const cx = this.R.cx, art = this.art('mosaic_hand'), im = art || (imgOk(this.R.images.w_mosaic) ? this.R.images.w_mosaic : null);
    if (!im || a <= 0.01) return;
    cx.save(); cx.translate(x, y); cx.globalAlpha = c01(a); cx.imageSmoothingEnabled = false; // 네모 깨진 손이 흐려지지 않게
    if (!art) cx.rotate(Math.PI / 2);
    cx.scale(art ? 1 + sq * 0.25 : 1 - sq * 0.3, art ? 1 - sq * 0.3 : 1 + sq * 0.25);
    cx.drawImage(im, -s / 2, -s / 2, s, s);
    cx.restore();
  }
  mosaic(layer, o, T, g) {
    const cx = this.R.cx, n = o.lanes.length, wind = o.wind, end = wind + (n - 1) * o.gap + 0.55;
    if (T > end) { o.done = true; return; }
    const S = o.w * 3.2; // 손 크기 (줄 폭의 약 1.6배)
    if (layer === 'ground') { // 내려칠 줄 미리 보기: 붉은 빛 기둥 (점점 진하게) → 맞은 자리 납작한 충격 고리
      for (let i = 0; i < n; i++) {
        const at = wind + i * o.gap, lx = o.lanes[i];
        if (T < at) { const k = c01(T / at); this.glow(lx, o.ys[i], o.w * 1.4, 'rgba(255,60,110,1)', 0.12 + 0.25 * k, 2.4); }
        else { const k = c01((T - at) / 0.4); this.flatRing(lx, o.ys[i] + 14, 12 + eOut(k) * S * 0.7, 8, 'rgba(255,90,150,1)', (1 - k) * 0.9); }
      }
      return;
    }
    if (layer === 'top') {
      for (let i = 0; i < n; i++) {
        const at = wind + i * o.gap, lx = o.lanes[i], y1 = Math.max(120, o.ys[i] - S * 0.15), d0 = at - 0.13; // 점수판 밑으로
        if (T < d0) continue;
        let y, a = 1, sq = 0;
        if (T < at) { const k = eIn(c01((T - d0) / 0.13)); y = y1 - (1 - k) * 170; a = 0.4 + 0.6 * k; }
        else { const k = c01((T - at) / 0.45); y = y1; sq = Math.max(0, 1 - k * 4) ; a = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45; }
        this.mosaicHand(lx, y, S, a, sq);
      }
      return;
    }
    if (layer !== 'screen' || T > wind + 0.3) return;
    // 검은 검열 띠: 0.6초 동안 화면을 왼쪽 → 오른쪽으로 쓸고 지나간다 ("삐—")
    const C = cx.canvas, k0 = this.R.k || 1, cw = C.width / k0, ch = C.height / k0;
    const bh = 46, by = Math.round(ch * 0.5 - bh / 2); // 화면 가운데 (위 기술 이름 띠 · 아래 멤버 줄을 안 가리게)
    const k = c01(T / (wind * 0.8)), fade = T > wind ? 1 - (T - wind) / 0.3 : 1, bw = cw * eOut(k);
    if (bw < 2 || fade <= 0) return;
    cx.save(); cx.globalAlpha = c01(fade);
    const bar = this.art('censor');
    if (bar) cx.drawImage(bar, 0, 0, bar.naturalWidth * c01(bw / cw), bar.naturalHeight, 0, by, bw, bh);
    else { // 그림이 오기 전: 그 자리 화면을 실제로 모자이크 (줄였다 키우기) + 어둡게
      const N = Math.max(4, Math.round(bw / 9)), M = 5, sm = this._mzc || (this._mzc = document.createElement('canvas'));
      if (sm.width !== N || sm.height !== M) { sm.width = N; sm.height = M; }
      const sx = sm.getContext('2d'); sx.clearRect(0, 0, N, M); sx.drawImage(C, 0, by * k0, bw * k0, bh * k0, 0, 0, N, M);
      cx.imageSmoothingEnabled = false; cx.drawImage(sm, 0, by, bw, bh); cx.imageSmoothingEnabled = true;
      cx.fillStyle = 'rgba(0,0,0,0.62)'; cx.fillRect(0, by, bw, bh);
    }
    cx.font = `900 18px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = '#fff';
    cx.shadowColor = '#ff2a5a'; cx.shadowBlur = 6; if (bw > 130) cx.fillText('삐————', Math.min(bw - 70, cw / 2), by + bh / 2 + 1);
    cx.restore();
  }

  // ── 공용 그림 ────────────────────────────────
  glow(x, y, r, col, a, sy = 1) { // 부드러운 빛 덩어리 (더하기)
    if (a <= 0.01 || r <= 1) return;
    const cx = this.R.cx;
    cx.save(); cx.translate(x, y); cx.scale(1, sy);
    cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = c01(a);
    const gr = cx.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = gr; cx.beginPath(); cx.arc(0, 0, r, 0, TAU); cx.fill();
    cx.restore();
  }
  flatRing(x, y, r, w, col, a, sy = 0.38) { // 바닥 고리 (납작 · 더하기 · 테두리 흐림)
    if (a <= 0.01 || r <= 1) return;
    const cx = this.R.cx;
    cx.save(); cx.translate(x, y); cx.scale(1, sy);
    cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = c01(a);
    const r0 = Math.max(0, r - w), r1 = r + w;
    const gr = cx.createRadialGradient(0, 0, r0, 0, 0, r1);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = gr; cx.beginPath(); cx.arc(0, 0, r1, 0, TAU); cx.fill();
    cx.restore();
  }
  star4(x, y, s, rot, col, a) { // 반짝 (네 갈래 빛)
    if (a <= 0.01) return;
    const cx = this.R.cx;
    cx.save(); cx.translate(x, y); cx.rotate(rot); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = c01(a);
    cx.fillStyle = col;
    cx.beginPath();
    for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2; cx.lineTo(Math.cos(an) * s, Math.sin(an) * s); cx.lineTo(Math.cos(an + Math.PI / 4) * s * 0.22, Math.sin(an + Math.PI / 4) * s * 0.22); }
    cx.closePath(); cx.fill();
    cx.fillStyle = '#ffffff'; cx.beginPath(); cx.arc(0, 0, s * 0.18, 0, TAU); cx.fill();
    cx.restore();
  }
  spark(x, y, s, col, k) { // 맞은 자리 불꽃 (선 여러 갈래 · 더하기)
    const cx = this.R.cx, a = 1 - k;
    if (a <= 0) return;
    cx.save(); cx.translate(x, y); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = a;
    cx.strokeStyle = col; cx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const an = i * TAU / 8 + (i % 2) * 0.2, r0 = s * (0.2 + k * 0.6), r1 = s * (0.55 + k * 0.7) * (i % 2 ? 0.7 : 1);
      cx.lineWidth = (i % 2 ? 2 : 3.2) * (1 - k * 0.6);
      cx.beginPath(); cx.moveTo(Math.cos(an) * r0, Math.sin(an) * r0); cx.lineTo(Math.cos(an) * r1, Math.sin(an) * r1); cx.stroke();
    }
    cx.restore();
    this.glow(x, y, s * (0.8 + k * 0.4), col, a * 0.8);
  }
  label(x, y, txt, size, fill, stroke, a = 1, sc = 1) { // 굵은 글자 (캔버스 테두리 · 빛)
    const cx = this.R.cx;
    cx.save(); cx.translate(x, y); cx.scale(sc, sc); cx.globalAlpha = c01(a);
    cx.font = `900 ${size}px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.lineJoin = 'round';
    cx.lineWidth = Math.max(3, size * 0.24); cx.strokeStyle = stroke; cx.strokeText(txt, 0, 0);
    cx.fillStyle = fill; cx.fillText(txt, 0, 0);
    cx.restore();
  }
  dim(cxs, cys, a, r0 = 70, r1 = 260, col = '8,6,20') { // 화면 어둡게 · 한 사람만 밝게 (화면 좌표)
    if (a <= 0.01) return;
    const R = this.R, cx = R.cx;
    const gr = cx.createRadialGradient(cxs, cys, r0, cxs, cys, r1);
    gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(1, `rgba(${col},${a.toFixed(3)})`);
    cx.fillStyle = gr; cx.fillRect(0, 0, R.W, R.H);
  }

  // ── 배현경: 다이어트 주사 ──────────────────────
  //  큰 주사기가 날아와 푹 → 분홍 약물 고리 · 변신 연기(통통↔날씬 바뀌는 순간을 가림) → 약물 방울이 근처 진상에게 튀어 반짝
  syringe(len, fill, a) {
    const cx = this.R.cx, im = this.art('syringe');
    cx.globalAlpha = c01(a);
    if (im) { const h = len * (im.naturalHeight / im.naturalWidth); cx.drawImage(im, -len, -h / 2, len, h); return; } // 그림: 바늘 끝이 오른쪽
    const bw = len * 0.5, bh = len * 0.2, bx = -len * 0.82; // 몸통
    cx.lineJoin = 'round'; cx.lineCap = 'round';
    // 바늘
    cx.strokeStyle = '#3a1830'; cx.lineWidth = 3.4; cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(-len * 0.3, 0); cx.stroke();
    cx.strokeStyle = '#e8eef6'; cx.lineWidth = 1.6; cx.beginPath(); cx.moveTo(-1, 0); cx.lineTo(-len * 0.3, 0); cx.stroke();
    // 바늘 뿌리
    cx.fillStyle = '#ff8fc4'; cx.strokeStyle = '#3a1830'; cx.lineWidth = 2;
    cx.beginPath(); cx.moveTo(-len * 0.3, -bh * 0.22); cx.lineTo(-len * 0.34, -bh * 0.4); cx.lineTo(-len * 0.34, bh * 0.4); cx.lineTo(-len * 0.3, bh * 0.22); cx.closePath(); cx.fill(); cx.stroke();
    // 통 (유리) + 약물
    cx.fillStyle = 'rgba(240,248,255,0.85)'; cx.beginPath(); cx.roundRect ? cx.roundRect(bx, -bh / 2, bw, bh, 4) : cx.rect(bx, -bh / 2, bw, bh); cx.fill();
    const fw = bw * c01(fill);
    if (fw > 1) { const gr = cx.createLinearGradient(0, -bh / 2, 0, bh / 2); gr.addColorStop(0, '#ffb3dc'); gr.addColorStop(0.5, '#ff4fa3'); gr.addColorStop(1, '#d02a7e'); cx.fillStyle = gr; cx.fillRect(bx + bw - fw, -bh / 2 + 2, fw - 1, bh - 4); }
    cx.fillStyle = 'rgba(255,255,255,0.75)'; cx.fillRect(bx + 3, -bh / 2 + 2.5, bw - 6, 2.5); // 유리 반짝
    cx.strokeStyle = 'rgba(58,24,48,0.55)'; cx.lineWidth = 1; for (let i = 1; i < 5; i++) { const gx = bx + bw - (bw / 5) * i; cx.beginPath(); cx.moveTo(gx, -bh / 2); cx.lineTo(gx, -bh * 0.1); cx.stroke(); } // 눈금
    cx.strokeStyle = '#3a1830'; cx.lineWidth = 2.2; cx.beginPath(); cx.roundRect ? cx.roundRect(bx, -bh / 2, bw, bh, 4) : cx.rect(bx, -bh / 2, bw, bh); cx.stroke();
    // 손잡이 날개 + 밀대
    cx.fillStyle = '#f2f2f8'; cx.beginPath(); cx.rect(bx - 4, -bh * 0.85, 4, bh * 1.7); cx.fill(); cx.stroke();
    const px = bx - 4 - bw * 0.45 * c01(fill); // 밀대가 들어가며 짧아짐
    cx.fillStyle = '#ff7fb8'; cx.beginPath(); cx.rect(px, -bh * 0.16, bx - 4 - px, bh * 0.32); cx.fill(); cx.stroke();
    cx.fillStyle = '#ff9fd0'; cx.beginPath(); cx.rect(px - 4, -bh * 0.55, 4, bh * 1.1); cx.fill(); cx.stroke();
  }
  diet(layer, o, T, g) {
    const fx = this.fx, cx = this.R.cx, h = o.h;
    const hx = h ? h.rx || h.x : o.x, hy = h ? h.y : o.y;
    const IMP = 0.32, END = 1.5;
    if (T > END) { o.done = true; return; }
    const ex = hx + 6, ey = hy - 26; // 주사 맞는 곳 (팔/몸)
    const side = hx > (g.W || 360) / 2 ? -1 : 1, sx0 = hx + side * 84, sy0 = hy - 150; // 화면 가운데 쪽에서 날아온다
    if (layer === 'ground') {
      if (T >= IMP) { // 분홍 약물 튀는 고리 (바닥 · 납작)
        const k = c01((T - IMP) / 0.6);
        if (k < 1) {
          this.glow(hx, hy + HERO_FEET, 30 + k * 70, 'rgba(255,90,170,0.9)', (1 - k) * 0.8, 0.38);
          this.flatRing(hx, hy + HERO_FEET, 14 + eOut(k) * 92, 9, 'rgba(255,120,190,1)', 1 - k);
          this.flatRing(hx, hy + HERO_FEET, 8 + eOut(c01(k * 1.4)) * 60, 6, 'rgba(255,220,240,1)', (1 - k) * 0.8);
          // 고리 가장자리 물방울 (왕관 모양으로 튀었다 떨어짐)
          cx.save(); cx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 12; i++) { const an = i * TAU / 12, rr = 14 + eOut(k) * 88; const jump = Math.sin(k * Math.PI) * (10 + (i % 3) * 5); cx.globalAlpha = (1 - k) * 0.9; cx.fillStyle = i % 2 ? '#ff6fb5' : '#ffc4e4'; cx.beginPath(); cx.ellipse(hx + Math.cos(an) * rr, hy + HERO_FEET + Math.sin(an) * rr * 0.38 - jump, 3.2, 4.4, 0, 0, TAU); cx.fill(); }
          cx.restore();
        }
      }
      for (const d of o.drops) if (d.hit && T - d.hitT < 0.6) { const k = (T - d.hitT) / 0.6, fe = d.e.def ? d.e.def.size * 0.3 : 12; this.flatRing(d.tx, d.ty + fe, 10 + eOut(k) * 26, 5, 'rgba(255,110,185,1)', (1 - k) * 0.9); }
      return;
    }
    if (layer === 'mid') {
      // 변신 연기 (불투명한 분홍·흰 구름이 잠깐 몸을 감쌈 → 그 사이 모습이 바뀜)
      if (T >= IMP && T < IMP + 0.75) {
        const k = (T - IMP) / 0.75;
        for (let i = 0; i < (o.busy ? 6 : 10); i++) {
          const an = i * TAU / (o.busy ? 6 : 10) + i * 0.7, rr = 10 + eOut(k) * (26 + (i % 3) * 8);
          const px = hx + Math.cos(an) * rr, py = hy - 18 + Math.sin(an) * rr * 0.8 - k * 14, r = (14 + (i % 3) * 5) * (0.7 + eOut(k) * 0.6);
          cx.save(); cx.globalAlpha = (1 - k) * (k < 0.15 ? k / 0.15 : 1) * 0.85;
          const gr = cx.createRadialGradient(px, py, 0, px, py, r);
          gr.addColorStop(0, i % 2 ? 'rgba(255,240,248,1)' : 'rgba(255,200,228,1)'); gr.addColorStop(0.6, i % 2 ? 'rgba(255,228,242,0.8)' : 'rgba(255,170,212,0.75)'); gr.addColorStop(1, 'rgba(255,190,225,0)');
          cx.fillStyle = gr; cx.beginPath(); cx.arc(px, py, r, 0, TAU); cx.fill(); cx.restore();
        }
        this.glow(hx, hy - 18, 70, 'rgba(255,120,200,0.9)', (1 - k) * 0.6);
      }
      return;
    }
    if (layer !== 'top') return;
    // 주사기: 나타남(0~0.16) → 돌진(0.16~0.32) → 푹 누름(0.32~0.55) → 빠지며 사라짐(0.55~0.85)
    if (T < 0.85) {
      let x, y, sc = 1, fill = 1, a = 1, rot = Math.atan2(ey - sy0, ex - sx0);
      if (T < 0.16) { const k = T / 0.16; x = sx0; y = sy0 + Math.sin(k * Math.PI) * -6; sc = eBack(k) * 1.05; a = c01(k * 2); }
      else if (T < IMP) { const k = eIn((T - 0.16) / (IMP - 0.16)); x = sx0 + (ex - sx0) * k; y = sy0 + (ey - sy0) * k; }
      else if (T < 0.55) { const k = (T - IMP) / (0.55 - IMP); x = ex + Math.sin(T * 90) * 1.2; y = ey; fill = 1 - eOut(k); }
      else { const k = (T - 0.55) / 0.3; x = ex - Math.cos(rot) * 36 * eOut(k); y = ey - Math.sin(rot) * 36 * eOut(k) - k * 10; fill = 0; a = 1 - k; rot += k * 1.2; }
      if (T >= 0.16 && T < IMP) for (let gi = 3; gi >= 1; gi--) { const k = eIn(Math.max(0, (T - 0.16 - gi * 0.025) / (IMP - 0.16))); cx.save(); cx.translate(sx0 + (ex - sx0) * k, sy0 + (ey - sy0) * k); cx.rotate(rot); this.syringe(80, 1, 0.16 * (4 - gi)); cx.restore(); } // 잔상
      this.glow(x - Math.cos(rot) * 40, y - Math.sin(rot) * 40, 54, 'rgba(255,100,190,0.95)', a * 0.55);
      cx.save(); cx.translate(x, y); cx.rotate(rot); cx.scale(sc, sc); this.syringe(80, fill, a); cx.restore();
    }
    if (T >= IMP && !o.imp) { // 푹!
      o.imp = true;
      fx.addShake(6); fx.flash('#ffd6ec', 0.22);
      fx.text(ex + 22, ey - 40, '푹!', '#ff9fd0', 16, 0.5, -40);
      for (let k = 0; k < (o.busy ? 8 : 16); k++) { const an = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, s = 120 + Math.random() * 160; fx.part('dot', ex, ey, Math.cos(an) * s, Math.sin(an) * s, 0.5 + Math.random() * 0.3, 3 + Math.random() * 2.5, k % 3 ? '#ff5fae' : '#ffd0ea', { grav: 520, drag: 0.6 }); }
      fx.burst(hx, hy - 20, o.busy ? 6 : 12, '#ffc4e4', 170, 'star', 7, 0.6);
    }
    // 약물 방울 → 진상
    for (const d of o.drops) {
      if (T < d.at) continue;
      if (!d.hit) {
        if (!d.e.dead) { d.tx = d.e.x; d.ty = d.e.y - (d.e.def ? d.e.def.size * 0.35 : 20); }
        const k = c01((T - d.at) / d.fl);
        const px = ex + (d.tx - ex) * k, py = ey + (d.ty - ey) * k - Math.sin(k * Math.PI) * 70;
        for (let gi = 0; gi < 4; gi++) { const kk = Math.max(0, k - gi * 0.06); const qx = ex + (d.tx - ex) * kk, qy = ey + (d.ty - ey) * kk - Math.sin(kk * Math.PI) * 70; this.glow(qx, qy, 11 - gi * 2, 'rgba(255,110,190,1)', 0.7 - gi * 0.15); }
        cx.save(); cx.globalAlpha = 1; cx.fillStyle = '#ff4fa3'; cx.strokeStyle = '#ffe0f0'; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(px, py, 4.2, 0, TAU); cx.fill(); cx.stroke(); cx.restore();
        if (k >= 1) { d.hit = true; d.hitT = T; fx.burst(d.tx, d.ty, o.busy ? 3 : 6, '#ff7fb8', 150, 'dot', 3, 0.35); }
      } else if (T - d.hitT < 0.3) this.spark(d.tx, d.ty, 22, 'rgba(255,120,200,1)', (T - d.hitT) / 0.3);
    }
  }

  // ── 문동한: 진심 모드 ──────────────────────────
  //  화면이 어두워지고 금빛 기운이 모임 → (일어서는 순간) 번쩍 · 집중선 · 충격파 · 흔들림 · 0.2초 느리게 → 금빛 오라 · 커피 김 소용돌이
  serious(layer, o, T, g) {
    const fx = this.fx, cx = this.R.cx, h = o.h;
    if (!h || h.gone || !g.heroes.includes(h)) { o.done = true; return; }
    const hx = h.rx || h.x, hy = h.y;
    // 일어서는 순간 = 변신 띠(누움→커피→일어남)의 일어나는 칸 (burstT 0.4 남았을 때) · 진상이 없어 안 일어나면 0.55초에
    if (!o.imp && layer === 'ground' && ((h.burstT > 0 && h.burstT <= 0.4) || (!(h.burstT > 0) && T > 0.55))) {
      o.imp = true; o.impT = T;
      fx.flash('#fff3c0', 0.55); fx.addShake(11);
      if (!g.pvp && !(fx.slowmo > 0)) { fx.slowmo = 0.2; fx.zoomTarget = 1.07; fx.zx = hx; fx.zy = hy - 40; } // 보는 느낌만 0.2초 느리게 (계산은 그대로)
      fx.burst(hx, hy - 30, o.busy ? 10 : 22, '#ffd84a', 260, 'spark', 4, 0.5);
      fx.burst(hx, hy - 20, o.busy ? 6 : 14, '#fff4c8', 180, 'dot', 3, 0.6, -60);
    }
    const it = o.imp ? T - o.impT : -1; // 일어난 뒤 시간
    const END = (o.imp ? o.impT : T) + 1.9;
    if (o.imp && T > END) { o.done = true; return; }
    const pre = o.imp ? 1 : c01(T / 0.5); // 모이는 정도
    const fade = it > 1.3 ? 1 - c01((it - 1.3) / 0.6) : 1;
    if (layer === 'screen') {
      // 어둡게 (문동한만 밝게)
      const [sx, sy] = this.scr(hx, hy - 20);
      const da = (o.imp ? (it < 0.5 ? 0.55 : 0.55 * (1 - c01((it - 0.5) / 0.5))) : 0.55 * c01(T / 0.18));
      this.dim(sx, sy, da, 60, 300);
      // 집중선 (일어난 뒤 0.4초)
      if (o.imp && it < 0.4) {
        const a = (1 - it / 0.4) * 0.7, W = this.R.W, H = this.R.H;
        cx.save(); cx.globalAlpha = a; cx.fillStyle = '#fffbe8';
        for (let i = 0; i < 44; i++) {
          const an = (i / 44) * TAU + Math.random() * 0.1, w = 0.012 + Math.random() * 0.02, r0 = 95 + Math.random() * 70, r1 = Math.max(W, H) * 1.2;
          cx.beginPath(); cx.moveTo(sx + Math.cos(an) * r0, sy + Math.sin(an) * r0); cx.lineTo(sx + Math.cos(an - w) * r1, sy + Math.sin(an - w) * r1); cx.lineTo(sx + Math.cos(an + w) * r1, sy + Math.sin(an + w) * r1); cx.closePath(); cx.fill();
        }
        cx.restore();
      }
      return;
    }
    if (layer === 'ground') {
      this.glow(hx, hy + HERO_FEET, 46 + pre * 30 + (o.imp ? Math.sin(T * 9) * 6 : 0), 'rgba(255,196,60,1)', (0.35 + pre * 0.45) * fade, 0.36);
      if (o.imp && it < 0.7) { // 충격파 (바닥)
        const k = it / 0.7;
        this.flatRing(hx, hy + HERO_FEET, 18 + eOut(k) * 170, 14, 'rgba(255,214,90,1)', (1 - k));
        this.flatRing(hx, hy + HERO_FEET, 10 + eOut(c01(k * 1.3)) * 110, 8, 'rgba(255,255,230,1)', (1 - k) * 0.85);
      }
      if (T > 0.08 && fade > 0) this.steam(hx, hy, T, fade, true); // 김 뒤쪽 반
      // 금빛 오라 (불꽃처럼 위로 · 몸 뒤에 그려서 얼굴을 가리지 않게) — 일어난 뒤 크게
      const big = o.imp ? (it < 0.15 ? 0.6 + it / 0.15 * 0.6 : 1.2 - c01((it - 0.15) / 0.4) * 0.2) : pre * 0.5;
      if (big > 0.02) {
        const A = fade * (o.imp ? 1 : 0.6);
        this.glow(hx, hy - 22, 66 * big, 'rgba(255,190,50,1)', 0.6 * A, 1.35);
        cx.save(); cx.globalCompositeOperation = 'lighter';
        const n = o.busy ? 7 : 11;
        for (let i = 0; i < n; i++) { // 불꽃 혀
          const u = (i / (n - 1)) * 2 - 1, ph = T * (5 + (i % 3)) + i * 1.7;
          const bx = hx + u * 30 * big, by = hy + HERO_FEET - 4, tall = (54 + (1 - Math.abs(u)) * 46 + Math.sin(ph) * 12) * big;
          const gr = cx.createLinearGradient(bx, by, bx, by - tall);
          gr.addColorStop(0, 'rgba(255,170,40,0)'); gr.addColorStop(0.25, 'rgba(255,190,60,0.55)'); gr.addColorStop(0.7, 'rgba(255,236,150,0.35)'); gr.addColorStop(1, 'rgba(255,255,220,0)');
          cx.globalAlpha = A; cx.fillStyle = gr;
          const sw = Math.sin(ph * 0.8) * 8 * big;
          cx.beginPath(); cx.moveTo(bx - 9 * big, by); cx.quadraticCurveTo(bx - 10 * big + sw, by - tall * 0.55, bx + sw * 1.4, by - tall); cx.quadraticCurveTo(bx + 10 * big + sw, by - tall * 0.55, bx + 9 * big, by); cx.closePath(); cx.fill();
        }
        cx.restore();
      }
      return;
    }
    if (layer === 'mid') {
      // 모이는 금빛 (일어나기 전): 입자가 몸으로 빨려 들어감
      if (!o.imp) {
        cx.save(); cx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < (o.busy ? 8 : 16); i++) { const ph = ((T * 1.6 + i / 16) % 1), an = i * 2.4, rr = 90 * (1 - ph); cx.globalAlpha = ph * 0.9; cx.fillStyle = i % 2 ? '#ffe07a' : '#fff4c8'; cx.beginPath(); cx.arc(hx + Math.cos(an) * rr, hy - 20 + Math.sin(an) * rr * 0.7, 2 + ph * 1.5, 0, TAU); cx.fill(); }
        cx.restore();
        this.glow(hx, hy - 18, 40 + pre * 20, 'rgba(255,200,80,1)', pre * 0.45);
      }
      // 커피 김 소용돌이 (두 가닥 · 위로 돌며 올라감 · 앞쪽 반)
      if (T > 0.08 && fade > 0) this.steam(hx, hy, T, fade, false);
      // 에너지 기둥 (일어난 순간 위로 솟는 빛)
      if (o.imp && it < 0.55) {
        const k = it / 0.55, w = 30 * (1 - k * 0.7);
        cx.save(); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 1 - k;
        const gr = cx.createLinearGradient(hx - w, 0, hx + w, 0); gr.addColorStop(0, 'rgba(255,200,60,0)'); gr.addColorStop(0.5, 'rgba(255,248,210,1)'); gr.addColorStop(1, 'rgba(255,200,60,0)');
        cx.fillStyle = gr; cx.fillRect(hx - w, -40, w * 2, hy - 56 + 40);
        cx.restore();
      }
      return;
    }
    if (layer === 'top' && o.imp && it < 0.35) { // 번쩍 고리
      const k = it / 0.35;
      cx.save(); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 1 - k; cx.strokeStyle = '#fff1b0'; cx.lineWidth = 6 * (1 - k) + 1;
      cx.beginPath(); cx.arc(hx, hy - 24, 20 + eOut(k) * 80, 0, TAU); cx.stroke(); cx.restore();
    }
  }

  steam(hx, hy, T, fade, back) { // 커피 김 두 가닥 (뒤쪽 반은 몸 뒤 · 앞쪽 반은 몸 앞)
    const cx = this.R.cx;
    cx.save();
    for (let s = 0; s < 2; s++) for (let i = 0; i < 14; i++) {
      const v = i / 14, an = T * 5 + v * 9 + s * Math.PI, rr = 18 + v * 22;
      if ((Math.sin(an) < 0) !== back) continue;
      const px = hx + Math.cos(an) * rr, py = hy + 10 - v * 110 + Math.sin(an) * 6, r = 7 + v * 8;
      cx.globalAlpha = (1 - v) * 0.5 * fade * c01((T - 0.08) / 0.25);
      const gr = cx.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(255,250,236,1)'); gr.addColorStop(1, 'rgba(255,240,210,0)');
      cx.fillStyle = gr; cx.beginPath(); cx.arc(px, py, r, 0, TAU); cx.fill();
    }
    cx.restore();
  }

  // ── 오지은: 시간 정지 ──────────────────────────
  //  오지은에게서 물결이 퍼지며 색이 빠짐(회색) → 범위에 큰 시계(초침 째깍째깍 → 멈춤) · 멈춘 진상은 얼음빛 테두리 + 작은 시계
  //  끝나면 거꾸로 물결이 오지은에게 모이며 색이 돌아온다. (게임 시간 기준 — 일시정지하면 같이 멈춤)
  timestop(layer, o, T0, g) {
    const R = this.R, cx = R.cx, h = o.h;
    const T = g.t - o.st0, IN = 0.45, OUT = 0.55, end = o.dur;
    if (T > end + 0.05 || T < -0.5) { o.done = true; return; }
    const ox = h && !h.gone ? h.rx || h.x : o.ox, oy = h && !h.gone ? h.y - 20 : o.oy;
    const far = Math.hypot(Math.max(ox, R.W - ox), Math.max(oy, R.H - oy)) + 40;
    // 회색 영역 반지름: 퍼짐 → 꽉 → (끝) 오지은 쪽으로 줄어듦
    let gr0 = far, edge = -1;
    if (T < IN) { gr0 = eOut(T / IN) * far; edge = gr0; } else if (T > end - OUT) { gr0 = (1 - eIn(c01((T - (end - OUT)) / OUT))) * far; edge = gr0; }
    const outK = T > end - OUT ? c01((T - (end - OUT)) / OUT) : 0;
    if (layer === 'mid') {
      // 1) 색 빼기 (채도 0 · 살짝 푸르게) — 오지은 자리는 비워 둔다
      if (gr0 > 2) {
        cx.save();
        cx.beginPath(); cx.arc(ox, oy, gr0, 0, TAU);
        cx.moveTo(ox + 34, oy - 6); cx.arc(ox, oy - 6, 34, 0, TAU, true); // 오지은은 색 그대로
        cx.clip('evenodd');
        cx.globalCompositeOperation = 'saturation'; cx.globalAlpha = 0.92; cx.fillStyle = '#808080'; cx.fillRect(-40, -60, R.W + 80, R.H + 120);
        cx.globalCompositeOperation = 'multiply'; cx.globalAlpha = 0.32; cx.fillStyle = '#b9c9ff'; cx.fillRect(-40, -60, R.W + 80, R.H + 120);
        cx.restore();
      }
      // 2) 물결 테두리 (퍼질 때 · 돌아올 때)
      if (edge > 0) {
        cx.save(); cx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) { const rr = edge - i * 16; if (rr <= 2) continue; cx.globalAlpha = (0.75 - i * 0.22) * (T < IN ? 1 : 0.9); cx.strokeStyle = i ? 'rgba(170,200,255,1)' : 'rgba(235,245,255,1)'; cx.lineWidth = i ? 3 : 7; cx.beginPath(); cx.arc(ox, oy, rr, 0, TAU); cx.stroke(); }
        cx.restore();
        this.glow(ox, oy, 70, 'rgba(180,140,255,1)', 0.5);
      }
      // 3) 오지은 둘레 보라 기운 (시간 밖에 있는 사람)
      if (h && !h.gone && T < end) this.glow(ox, oy - 4, 46 + Math.sin(g.t * 6) * 4, 'rgba(190,120,255,1)', 0.45 * (1 - outK));
      // 4) 큰 시계 (범위 = 시계판)
      for (const c of o.clocks) this.clockFace(c, T - c.t, end - c.t, g);
      // 5) 멈춘 진상: 얼음빛 테두리 + 작은 시계
      const lite = o.busy || o.frozen.length > 24;
      for (const e of o.frozen) {
        if (e.dead || !(e.slowT > 0)) continue;
        const sz = e.def ? e.def.size : 50, feet = e.y + sz * 0.3, top = feet - sz * 0.92;
        const a = c01(T / 0.3) * (1 - outK);
        if (a <= 0.01) continue;
        if (!lite) this.iceOutline(e, sz, feet, a);
        this.miniClock(e.x + sz * 0.3, top + 6, 8, a, T);
      }
      return;
    }
    if (layer === 'top' && T < 0.25) { // 시작 번쩍
      const k = T / 0.25;
      this.glow(ox, oy, 60 + k * 60, 'rgba(220,230,255,1)', (1 - k) * 0.8);
    }
  }
  clockFace(c, T, left, g) { // 범위 원 = 시계판 · 초침이 째깍째깍 돌다가 탁 멈춘다
    const cx = this.R.cx, r = c.r, x = c.x, y = c.y;
    if (T < 0) return;
    const a = c01(T / 0.3) * (left < 0.55 ? c01(left / 0.55) : 1);
    if (a <= 0.01) return;
    const STOP = 0.95, stopped = T >= STOP;
    const pop = stopped && T - STOP < 0.25 ? 1 + Math.sin(((T - STOP) / 0.25) * Math.PI) * 0.05 : 1;
    cx.save(); cx.translate(x, y); cx.scale(pop, pop);
    // 판 (아주 옅은 푸른 유리)
    const fg = cx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    fg.addColorStop(0, 'rgba(190,210,255,0.05)'); fg.addColorStop(0.85, 'rgba(170,195,255,0.13)'); fg.addColorStop(1, 'rgba(210,225,255,0.28)');
    cx.globalAlpha = a; cx.fillStyle = fg; cx.beginPath(); cx.arc(0, 0, r, 0, TAU); cx.fill();
    cx.globalCompositeOperation = 'lighter';
    cx.strokeStyle = 'rgba(200,220,255,0.9)'; cx.lineWidth = 3; cx.globalAlpha = a * 0.7; cx.beginPath(); cx.arc(0, 0, r, 0, TAU); cx.stroke();
    cx.lineWidth = 1.2; cx.globalAlpha = a * 0.45; cx.beginPath(); cx.arc(0, 0, r - 9, 0, TAU); cx.stroke();
    // 눈금 (60 · 12)
    for (let i = 0; i < 60; i++) {
      const an = (i / 60) * TAU, big = i % 5 === 0, r0 = r - (big ? 22 : 11), r1 = r - 4;
      cx.globalAlpha = a * (big ? 0.9 : 0.4); cx.lineWidth = big ? 4 : 1.5; cx.strokeStyle = big ? 'rgba(235,242,255,1)' : 'rgba(190,210,255,1)';
      cx.beginPath(); cx.moveTo(Math.cos(an) * r0, Math.sin(an) * r0); cx.lineTo(Math.cos(an) * r1, Math.sin(an) * r1); cx.stroke();
    }
    // 바늘: 시침 · 분침 고정 · 초침은 0.13초마다 한 칸 → 멈춤 (멈출 때 살짝 떨림)
    const tick = Math.min(Math.floor(T / 0.13), Math.floor(STOP / 0.13));
    const sub = !stopped ? c01(((T % 0.13) / 0.13) * 4) : 1;
    let sa = -Math.PI / 2 + ((tick - 1 + eBack(sub)) / 60) * TAU * 1.5;
    if (stopped && T - STOP < 0.3) sa += Math.sin((T - STOP) * 60) * 0.03 * (1 - (T - STOP) / 0.3);
    const hand = (an, len, w, col, al) => { cx.globalAlpha = a * al; cx.strokeStyle = col; cx.lineWidth = w; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(-Math.cos(an) * len * 0.15, -Math.sin(an) * len * 0.15); cx.lineTo(Math.cos(an) * len, Math.sin(an) * len); cx.stroke(); };
    hand(-Math.PI / 2 + TAU * (10 / 12), r * 0.42, 6, 'rgba(220,230,255,1)', 0.5);
    hand(-Math.PI / 2 + TAU * (2 / 60), r * 0.66, 4, 'rgba(220,230,255,1)', 0.5);
    hand(sa, r * 0.82, 2.4, stopped ? 'rgba(200,160,255,1)' : 'rgba(255,255,255,1)', 0.85);
    cx.globalAlpha = a; cx.fillStyle = 'rgba(230,220,255,1)'; cx.beginPath(); cx.arc(0, 0, 5, 0, TAU); cx.fill();
    // 멈춘 순간 퍼지는 고리
    if (stopped && T - STOP < 0.5) { const k = (T - STOP) / 0.5; cx.globalAlpha = (1 - k) * a; cx.strokeStyle = 'rgba(200,170,255,1)'; cx.lineWidth = 5 * (1 - k) + 1; cx.beginPath(); cx.arc(0, 0, r * (0.2 + eOut(k) * 0.8), 0, TAU); cx.stroke(); }
    cx.restore();
  }
  iceOutline(e, sz, feet, a) { // 얼음빛 테두리 (몸 둘레 차가운 빛 + 서리 조각)
    const cx = this.R.cx, cyy = feet - sz * 0.45;
    this.glow(e.x, cyy, sz * 0.62, 'rgba(120,200,255,1)', a * 0.42, 1.25);
    cx.save(); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = a * 0.7; cx.strokeStyle = 'rgba(190,235,255,1)'; cx.lineWidth = 2;
    cx.beginPath(); cx.ellipse(e.x, cyy, sz * 0.36, sz * 0.5, 0, 0, TAU); cx.stroke();
    cx.fillStyle = 'rgba(220,245,255,1)';
    for (let i = 0; i < 4; i++) { const an = i * 1.7 + e.uid, px = e.x + Math.cos(an) * sz * 0.36, py = cyy + Math.sin(an) * sz * 0.5; cx.beginPath(); cx.moveTo(px, py - 4); cx.lineTo(px + 2, py); cx.lineTo(px, py + 4); cx.lineTo(px - 2, py); cx.closePath(); cx.fill(); }
    cx.restore();
  }
  miniClock(x, y, r, a, T) {
    const cx = this.R.cx;
    cx.save(); cx.translate(x, y); cx.globalAlpha = c01(a);
    cx.fillStyle = 'rgba(28,30,70,0.85)'; cx.beginPath(); cx.arc(0, 0, r + 1.5, 0, TAU); cx.fill();
    cx.fillStyle = '#e8f6ff'; cx.beginPath(); cx.arc(0, 0, r, 0, TAU); cx.fill();
    cx.strokeStyle = '#7ec8ff'; cx.lineWidth = 1.6; cx.stroke();
    cx.strokeStyle = '#2a2f6a'; cx.lineWidth = 1.6; cx.lineCap = 'round';
    cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(0, -r * 0.7); cx.moveTo(0, 0); cx.lineTo(r * 0.5, 0); cx.stroke();
    cx.restore();
    this.glow(x, y, r * 2.2, 'rgba(140,210,255,1)', a * 0.35);
  }

  // ── 홍정민: 붕대 대공사 ────────────────────────
  //  붕대가 입구를 가로질러 촤악 감기고(가운데 X자) → 초록 회복 물결 · 큰 "+수리량" · 입구 가장자리 반짝
  //  입구 피해가 줄어드는 동안(bandT) 붕대가 남아 있다가 끝나면 사라진다
  bandStrip(x0, y0, x1, y1, k, a, roll) {
    const cx = this.R.cx, len = Math.hypot(x1 - x0, y1 - y0), an = Math.atan2(y1 - y0, x1 - x0), L = len * c01(k), H = 12;
    if (L < 1 || a <= 0.01) return;
    cx.save(); cx.translate(x0, y0); cx.rotate(an); cx.globalAlpha = c01(a);
    const im = this.art('bandage');
    if (im) cx.drawImage(im, 0, 0, Math.min(L, im.naturalWidth), im.naturalHeight, 0, -H / 2, L, H);
    else {
      cx.fillStyle = 'rgba(40,20,10,0.25)'; cx.fillRect(0, -H / 2 + 3, L, H); // 그림자
      const gr = cx.createLinearGradient(0, -H / 2, 0, H / 2); gr.addColorStop(0, '#fffaf0'); gr.addColorStop(0.55, '#f1e6d2'); gr.addColorStop(1, '#d4c3a4');
      cx.fillStyle = gr; cx.fillRect(0, -H / 2, L, H);
      cx.strokeStyle = 'rgba(150,120,90,0.35)'; cx.lineWidth = 1; // 붕대 결
      cx.beginPath(); for (let u = 4; u < L; u += 6) { cx.moveTo(u, -H / 2 + 1); cx.lineTo(u - 4, H / 2 - 1); } cx.stroke();
      cx.strokeStyle = 'rgba(120,95,70,0.7)'; cx.lineWidth = 1.2; cx.beginPath(); cx.moveTo(0, -H / 2); cx.lineTo(L, -H / 2); cx.moveTo(0, H / 2); cx.lineTo(L, H / 2); cx.stroke();
    }
    if (roll) { // 감기는 끝 (붕대 두루마리)
      cx.fillStyle = '#efe3cc'; cx.strokeStyle = 'rgba(110,85,60,0.9)'; cx.lineWidth = 1.5;
      cx.beginPath(); cx.ellipse(L, 0, 5, H * 0.75, 0, 0, TAU); cx.fill(); cx.stroke();
      cx.beginPath(); cx.ellipse(L, 0, 2, H * 0.3, 0, 0, TAU); cx.stroke();
    }
    cx.restore();
  }
  bandage(layer, o, T, g) {
    const fx = this.fx, cx = this.R.cx, W = this.R.W, ry = g.ropeY;
    const armed = g.bandT > 0;
    if (!armed && !o.offT && T > 1.4) o.offT = T;
    const off = o.offT ? c01((T - o.offT) / 0.45) : 0;
    if (off >= 1) { o.done = true; return; }
    const A = 1 - off;
    // 붕대 4줄: 왼→오 · 오→왼 · 가운데 X 두 줄
    const S = [
      [-8, ry - 64, W + 8, ry - 58, 0.05, 0.36],
      [W + 8, ry - 30, -8, ry - 38, 0.2, 0.36],
      [W / 2 - 46, ry - 104, W / 2 + 46, ry - 18, 0.4, 0.17],
      [W / 2 + 46, ry - 104, W / 2 - 46, ry - 18, 0.5, 0.17],
    ];
    if (layer === 'gate') {
      for (let i = 0; i < S.length; i++) {
        const [x0, y0, x1, y1, at, du] = S[i];
        const k = c01((T - at) / du);
        if (k <= 0) continue;
        const settle = T > at + du + 0.6 ? 0.88 : 1;
        this.bandStrip(x0, y0, x1, y1, eOut(k), A * settle, k < 1);
        if (k >= 1 && !o.landed[i]) { o.landed[i] = true; fx.burst(x1, y1, o.busy ? 3 : 7, '#fff6e0', 110, 'dot', 3, 0.35); if (i >= 2) fx.text(W / 2 + (i === 2 ? -30 : 30), ry - 112, '탁!', '#e9ffe9', 13, 0.4, -30); }
      }
      // 버티는 동안: 붕대 위로 빛이 스윽 지나감
      if (armed && T > 1) {
        const ph = ((T - 1) % 1.8) / 1.8, sxp = -60 + ph * (W + 120);
        cx.save(); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.5 * A;
        const gr = cx.createLinearGradient(sxp - 40, 0, sxp + 40, 0); gr.addColorStop(0, 'rgba(120,255,160,0)'); gr.addColorStop(0.5, 'rgba(200,255,215,0.9)'); gr.addColorStop(1, 'rgba(120,255,160,0)');
        cx.fillStyle = gr; cx.fillRect(sxp - 40, ry - 110, 80, 96); cx.restore();
      }
      // 초록 회복 물결 (세 번 · 입구 전체 + 바닥 고리)
      for (let p = 0; p < 3; p++) {
        const k = c01((T - 0.3 - p * 0.32) / 0.6);
        if (k <= 0 || k >= 1) continue;
        cx.save(); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = Math.sin(k * Math.PI) * 0.45;
        const gr = cx.createLinearGradient(0, ry + 30, 0, ry - 150); gr.addColorStop(0, 'rgba(60,255,120,0)'); gr.addColorStop(0.45, 'rgba(90,255,140,0.7)'); gr.addColorStop(1, 'rgba(60,255,120,0)');
        cx.fillStyle = gr; cx.fillRect(0, ry - 150, W, 180); cx.restore();
        this.flatRing(W / 2, ry - 6, 20 + eOut(k) * W * 0.62, 10, 'rgba(110,255,150,1)', (1 - k) * 0.9, 0.2);
      }
      return;
    }
    if (layer !== 'top') return;
    // 초록 "+" 가 입구에서 피어오름
    if (T < 1.4 && o.plus.length < (o.busy ? 6 : 14) && Math.random() < 0.5) o.plus.push({ x: 16 + Math.random() * (W - 32), y: ry - 20 - Math.random() * 60, t: T, s: 5 + Math.random() * 4 });
    for (const p of o.plus) {
      const k = (T - p.t) / 0.9; if (k >= 1) continue;
      const y = p.y - k * 40, a = Math.sin(k * Math.PI) * A, s = p.s;
      this.glow(p.x, y, s * 2.4, 'rgba(90,255,140,1)', a * 0.5);
      cx.save(); cx.globalAlpha = a; cx.fillStyle = '#d6ffe0'; cx.strokeStyle = '#1d6b35'; cx.lineWidth = 1.5;
      cx.beginPath(); cx.rect(p.x - s * 0.3, y - s, s * 0.6, s * 2); cx.rect(p.x - s, y - s * 0.3, s * 2, s * 0.6); cx.fill(); cx.restore();
    }
    // 입구 가장자리 반짝 (처음 1초 · 버티는 동안 가끔)
    if ((T > 0.3 && T < 1.2 && Math.random() < (o.busy ? 0.3 : 0.8)) || (armed && !o.busy && Math.random() < 0.1)) o.tw.push({ x: 8 + Math.random() * (W - 16), y: ry - 66 + (Math.random() < 0.5 ? 0 : 30) + (Math.random() - 0.5) * 12, t: T, s: 5 + Math.random() * 5 }); // 붕대 가장자리 반짝
    o.tw = o.tw.filter((p) => T - p.t < 0.5);
    for (const p of o.tw) { const k = (T - p.t) / 0.5; this.star4(p.x, p.y - k * 6, p.s * Math.sin(k * Math.PI), k * 1.5, 'rgba(200,255,215,1)', A * Math.sin(k * Math.PI)); }
    // 큰 "+수리량"
    if (o.v > 0 && T < 1.6) {
      const k = T / 1.6, sc = T < 0.18 ? 0.6 + eBack(T / 0.18) * 0.6 : 1.2 - c01((T - 0.18) / 0.3) * 0.2;
      const y = ry - 128 - eOut(k) * 34, a = (T < 0.08 ? T / 0.08 : 1) * (k > 0.75 ? (1 - k) / 0.25 : 1);
      this.glow(W / 2, y, 70, 'rgba(80,255,140,1)', a * 0.35, 0.6);
      this.label(W / 2, y, `+${o.v}`, 28, '#8dffaa', '#0c3a1c', a, sc);
      this.label(W / 2, y + 22, '입구 수리', 11, '#e2ffe8', '#0c3a1c', a * 0.95, 1);
    }
  }

  // ── 김영준: 돌격 · 베기 ────────────────────────
  //  박차고 나갈 때 흙먼지 + 보라 잔상 줄 · 붙어서 한 대 칠 때마다 초승달 베기 자국 (render.js 가 싸우는 자세 띠를 그린다)
  ysStrike(h, tg) {
    const a = this.ys || (this.ys = []);
    if (a.length > 10) a.shift();
    const sz = tg.def ? tg.def.size : 50;
    this.ysN = (this.ysN || 0) + 1;
    a.push({ x: tg.x, y: tg.y + sz * 0.3 - sz * 0.5, t: this.fx.time, an: (this.ysN % 2 ? -0.5 : 2.6) + (Math.random() - 0.5) * 0.6, r: sz * 0.42 + 8 });
    if (this.ysN % 3 === 0 && this.fx.parts.items.length < 300) this.fx.burst(tg.x, tg.y - sz * 0.25, 3, '#e6d8ff', 160, 'spark', 3, 0.2);
  }
  drawYs(g) {
    const cx = this.R.cx, now = this.fx.time;
    this.ys = this.ys.filter((q) => now - q.t < 0.2);
    for (const q of this.ys) {
      const k = (now - q.t) / 0.2, sweep = eOut(c01(k * 1.6)) * 2.2, a0 = q.an, a1 = q.an + sweep;
      cx.save(); cx.translate(q.x, q.y); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 1 - k; cx.lineCap = 'round';
      for (const [w, col, rr] of [[9, 'rgba(150,90,255,0.55)', 1], [4, 'rgba(235,225,255,1)', 1], [2, 'rgba(255,255,255,1)', 0.8]]) {
        cx.strokeStyle = col; cx.lineWidth = w * (1 - k * 0.5);
        cx.beginPath(); cx.arc(0, 0, q.r * rr, Math.max(a0, a1 - 1.4), a1); cx.stroke();
      }
      cx.restore();
      if (k < 0.4) this.spark(q.x + Math.cos(a1) * q.r, q.y + Math.sin(a1) * q.r, 12, 'rgba(200,170,255,1)', k / 0.4);
    }
  }
  ydash(layer, o, T, g) {
    const h = o.h, cx = this.R.cx;
    if (T > 0.35 || !h || h.gone) { o.done = true; return; }
    if (layer !== 'mid') return;
    const px = h.px !== undefined ? h.px : h.x, py = (h.py !== undefined ? h.py : h.y);
    const k = T / 0.35, dx = px - o.x, dy = py - o.y, L = Math.hypot(dx, dy);
    if (L < 8) return;
    cx.save(); cx.globalCompositeOperation = 'lighter'; cx.lineCap = 'round';
    for (let i = 0; i < 4; i++) { // 잔상 줄 (몸 높이 여러 줄)
      const off = (i - 1.5) * 9, nx = -dy / L * off, ny = dx / L * off, back = 0.55 + (i % 2) * 0.25;
      const gr = cx.createLinearGradient(px - dx * back, py - dy * back, px, py);
      gr.addColorStop(0, 'rgba(120,70,255,0)'); gr.addColorStop(1, i % 2 ? 'rgba(200,170,255,0.9)' : 'rgba(140,90,255,0.8)');
      cx.globalAlpha = (1 - k) * 0.85; cx.strokeStyle = gr; cx.lineWidth = i % 2 ? 2.5 : 4;
      cx.beginPath(); cx.moveTo(px - dx * back + nx, py - 30 - dy * back + ny); cx.lineTo(px + nx, py - 30 + ny); cx.stroke();
    }
    cx.restore();
  }

  // ── 박상화: 좋은남자 ──────────────────────────
  //  금빛 조명이 박상화에게 → 금화·지폐 비 → 금빛 "좋은 남자!" 띠 (꽃다발 한 방은 game.js 'bouquet')
  coin(x, y, r, ph, a) {
    const cx = this.R.cx, w = Math.abs(Math.cos(ph)) * r + 0.8;
    cx.save(); cx.translate(x, y); cx.globalAlpha = c01(a);
    cx.fillStyle = '#a8740a'; cx.beginPath(); cx.ellipse(0, 1, w, r, 0, 0, TAU); cx.fill();
    const gr = cx.createLinearGradient(-w, -r, w, r); gr.addColorStop(0, '#fff3a6'); gr.addColorStop(0.45, '#ffd23f'); gr.addColorStop(1, '#e09a10');
    cx.fillStyle = gr; cx.beginPath(); cx.ellipse(0, 0, w, r, 0, 0, TAU); cx.fill();
    if (w > r * 0.45) { cx.strokeStyle = 'rgba(160,100,0,0.8)'; cx.lineWidth = 1; cx.beginPath(); cx.ellipse(0, 0, w * 0.66, r * 0.66, 0, 0, TAU); cx.stroke(); }
    cx.restore();
  }
  bill(x, y, ph, rot, a) {
    const cx = this.R.cx, im = this.art('banknote');
    cx.save(); cx.translate(x, y); cx.rotate(rot); cx.scale(Math.cos(ph), 1); cx.globalAlpha = c01(a);
    if (im) { cx.drawImage(im, -14, -8, 28, 16); cx.restore(); return; }
    cx.fillStyle = '#2f7a3f'; cx.fillRect(-13, -7, 26, 14);
    cx.fillStyle = '#7fd17f'; cx.fillRect(-11.5, -5.5, 23, 11);
    cx.fillStyle = '#c8f2b8'; cx.beginPath(); cx.ellipse(0, 0, 4.5, 4, 0, 0, TAU); cx.fill();
    cx.fillStyle = '#2f7a3f'; cx.fillRect(-10, -4, 2.5, 2.5); cx.fillRect(7.5, 1.5, 2.5, 2.5);
    cx.restore();
  }
  goodBanner(o, T, g) { // 금빛 띠 "좋은 남자!" (화면 층 · 어둡게 위에)
    const cx = this.R.cx, W = this.R.W;
    if (T < 1.7) {
      const by = Math.min(g.ropeY - 170, this.R.H * 0.36), k = T < 0.22 ? eBack(T / 0.22) : 1, a = T > 1.35 ? 1 - (T - 1.35) / 0.35 : 1;
      const bw = 250, bh = 46;
      cx.save(); cx.translate(W / 2, by); cx.scale(Math.max(0.01, k), 1); cx.globalAlpha = c01(a);
      this.glow(0, 0, 150, 'rgba(255,200,60,1)', 0.35, 0.35);
      cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = c01(a);
      // 접힌 양 끝
      cx.fillStyle = '#9a6a00';
      for (const sd of [-1, 1]) { cx.beginPath(); cx.moveTo(sd * bw * 0.44, -bh * 0.3); cx.lineTo(sd * (bw * 0.56), -bh * 0.3); cx.lineTo(sd * (bw * 0.5), bh * 0.08); cx.lineTo(sd * (bw * 0.56), bh * 0.46); cx.lineTo(sd * bw * 0.44, bh * 0.46); cx.closePath(); cx.fill(); }
      const gr = cx.createLinearGradient(0, -bh / 2, 0, bh / 2); gr.addColorStop(0, '#fff2a8'); gr.addColorStop(0.45, '#ffcf3a'); gr.addColorStop(1, '#d48d00');
      cx.fillStyle = gr; cx.beginPath(); cx.moveTo(-bw / 2, -bh / 2); cx.lineTo(bw / 2, -bh / 2); cx.lineTo(bw / 2 - 8, bh / 2 - 6); cx.lineTo(-bw / 2 + 8, bh / 2 - 6); cx.closePath(); cx.fill();
      cx.strokeStyle = '#7a4e00'; cx.lineWidth = 2.5; cx.stroke();
      cx.strokeStyle = 'rgba(255,250,220,0.8)'; cx.lineWidth = 1.2; cx.beginPath(); cx.moveTo(-bw / 2 + 6, -bh / 2 + 4); cx.lineTo(bw / 2 - 6, -bh / 2 + 4); cx.stroke();
      // 빛 줄기 (한 번 스윽)
      if (T > 0.25 && T < 0.75) { const sxp = -bw / 2 + ((T - 0.25) / 0.5) * bw; cx.save(); cx.clip(); cx.globalCompositeOperation = 'lighter'; const sg = cx.createLinearGradient(sxp - 24, 0, sxp + 24, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.85)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = sg; cx.fillRect(sxp - 24, -bh, 48, bh * 2); cx.restore(); }
      cx.restore();
      this.label(W / 2, by - 3, o.echo ? '끝내주는 남자!!' : '좋은 남자!', 25, '#fffdf2', '#6a3d00', a, Math.max(0.01, k));
      this.label(W / 2, by + 30, `백 송이 꽃다발! · 성장 +${o.grow}%`, 12, '#ffe9a8', '#3a2400', a * c01((T - 0.15) / 0.2), 1);
    }
  }
  goodman(layer, o, T, g) {
    const fx = this.fx, cx = this.R.cx, h = o.h, W = this.R.W;
    const hx = h && !h.gone ? h.rx || h.x : o.x, hy = h && !h.gone ? h.y : o.y;
    const buff = g.hcSkT > 0;
    if (!buff && !o.offT && T > 1.8) o.offT = T;
    const off = o.offT ? c01((T - o.offT) / 0.5) : 0;
    if (off >= 1 && T > 2.2) { o.done = true; return; }
    const spot = T < 1.7 ? (T < 0.1 ? T / 0.1 : 1) * (T > 1.3 ? 1 - (T - 1.3) / 0.4 : 1) : 0;
    if (layer === 'screen') {
      const [sx, sy] = this.scr(hx, hy - 10);
      this.dim(sx, sy, 0.42 * spot, 50, 230);
      if (spot > 0) { // 조명 (위에서 내려오는 금빛 원뿔)
        const flick = T < 0.25 ? (Math.sin(T * 80) > 0 ? 1 : 0.55) : 1;
        cx.save(); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = spot * 0.5 * flick;
        const gr = cx.createLinearGradient(0, 0, 0, sy + 30); gr.addColorStop(0, 'rgba(255,220,120,0.04)'); gr.addColorStop(0.6, 'rgba(255,214,100,0.32)'); gr.addColorStop(0.85, 'rgba(255,220,120,0.22)'); gr.addColorStop(1, 'rgba(255,230,150,0)');
        cx.fillStyle = gr; cx.beginPath(); cx.moveTo(sx + 30 - 16, -10); cx.lineTo(sx + 30 + 16, -10); cx.lineTo(sx + 58, sy + 30); cx.lineTo(sx - 58, sy + 30); cx.closePath(); cx.fill();
        cx.restore();
      }
      this.goodBanner(o, T, g);
      return;
    }
    if (layer === 'ground') {
      if (spot > 0) this.glow(hx, hy + HERO_FEET, 70, 'rgba(255,220,110,1)', spot * 0.8, 0.34);
      // 버프 받는 멤버 발밑 금빛 고리
      const A = (1 - off) * c01((T - 0.25) / 0.3);
      if (A > 0) for (const m of g.heroes) { if (m.gone || m.summon) continue; const mx = m.rx || m.x; this.glow(mx, m.y - 14, 44, 'rgba(255,205,80,1)', A * 0.3, 1.3); this.flatRing(mx, m.y + HERO_FEET, 26 + Math.sin(T * 5 + m.slot) * 3, 6, 'rgba(255,214,90,1)', A * 0.75); }
      return;
    }
    if (layer === 'mid') {
      // 멤버 둘레 반짝이 (반짝반짝 네 갈래 빛)
      const A = (1 - off) * c01((T - 0.25) / 0.3);
      if (A > 0) for (const m of g.heroes) {
        if (m.gone || m.summon) continue;
        const mx = m.rx || m.x, my = m.y - 14;
        const n = o.busy ? 2 : 4;
        for (let i = 0; i < n; i++) {
          const ph = (T * 0.9 + i / n + m.slot * 0.37) % 1, an = i * 2.3 + m.slot * 1.1 + Math.floor(T * 0.9 + i / n + m.slot * 0.37) * 1.9;
          const px = mx + Math.cos(an) * 26, py = my + Math.sin(an) * 34 - ph * 10;
          this.star4(px, py, 7 * Math.sin(ph * Math.PI), ph * 2, 'rgba(255,236,150,1)', A * Math.sin(ph * Math.PI));
        }
      }
      return;
    }
    if (layer !== 'top') return;
    // 금화 · 지폐 비
    const dt = this.dt || 0.016;
    for (const c of o.rain) {
      if (T < c.delay) continue;
      if (c.y > g.H + 30) continue;
      c.x += c.vx * dt; c.y += c.vy * dt; c.ph += c.sp * dt;
      if (c.bill) { c.vx += Math.sin(T * 3 + c.ph) * 60 * dt; }
      const a = c.y > g.rowY + 30 ? 1 - c01((c.y - g.rowY - 30) / 50) : 1;
      if (a <= 0) { c.y = g.H + 40; continue; }
      if (c.bill) this.bill(c.x, c.y, c.ph, Math.sin(c.ph * 0.7) * 0.5, a);
      else { this.coin(c.x, c.y, 6.5 * c.s, c.ph, a); if (Math.cos(c.ph) > 0.92) this.star4(c.x - 2, c.y - 3, 6, 0.3, 'rgba(255,255,220,1)', a * 0.8); }
    }

  }
}
