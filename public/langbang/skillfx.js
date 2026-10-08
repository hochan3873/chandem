// 랑방 대전 — 스킬 전용 연출 (캔버스 코드 그림 · 빛은 더하기 합성 · 바닥 효과는 발밑에 납작하게)
//  배현경 다이어트 주사 · 요요 · 몸통 박치기 · 문동한 진심 모드 · 카페인 풀충전 · 오지은 시간 정지 · 홍정민 붕대 대공사 · 붕대 탁 · 박상화 좋은남자 · 강병화 원맨쇼
//  가벼운 평타 연출(lt): 서명훈 저주 번개 · 저주 딱지 · 홍정민 소주병 휘두름
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
let CURSE_GLOW = null; // 서명훈 저주 섬광 (미리 구운 빛 — 평타마다 그라데이션을 만들지 않게)
const curseGlow = () => {
  if (CURSE_GLOW || typeof document === 'undefined') return CURSE_GLOW;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,255,1)'); gr.addColorStop(0.22, 'rgba(255,90,230,0.85)'); gr.addColorStop(0.55, 'rgba(150,30,220,0.3)'); gr.addColorStop(1, 'rgba(60,0,120,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return (CURSE_GLOW = c);
};
const CAN_COL =[['#2b1a10', '#6b4024', '#e9d3b0'], ['#1d2a44', '#3d5a8a', '#f2e6cf'], ['#5a1f14', '#9a3a24', '#f4e2c4']]; // 문동한 캔커피 색 (블랙 · 블루 · 레드)

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
    } else if (kind === 'cafe') { // 문동한 카페인 풀충전 (캔커피가 다 떨어질 때까지 커피 김 오라)
      const h = this.heroOf(g, 'donghan');
      if (!h) return;
      for (const q of this.list) if (q.kind === 'cafe' || q.kind === 'serious') q.done = true;
      o.h = h; o.wind = e.wind || 0.9; o.rm = this.rmOn();
    } else if (kind === 'cafeMark') { // 캔커피 예고 얼룩 → 하늘에서 캔커피 쾅 (게임 시간 기준)
      if (this.list.filter((q) => q.kind === 'cafeMark').length > 14) return;
      o.x = e.x; o.y = e.y; o.r = e.r || 56; o.delay = e.t || 0.55; o.rm = this.rmOn();
    } else if (kind === 'encore') { // 김도훈 앵콜: 무대 조명 세 줄기가 훑고 · 멈춘 진상 머리 위로 떼창 음표
      for (const q of this.list) if (q.kind === 'encore') q.done = true;
      const h = this.heroOf(g, 'dohoon');
      o.h = h; o.x = h ? h.x : e.x; o.y = h ? h.y : e.y; o.r = e.r || 290; o.rm = this.rmOn();
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
    } else if (kind === 'oneman') { // 강병화 원맨쇼
      for (const q of this.list) if (q.kind === 'oneman') q.done = true;
      const h = this.heroOf(g, 'byunghwa');
      o.h = h; o.x = h ? h.x : e.x; o.y = h ? h.y : e.y;
      o.sec = e.sec || 5; o.atk = Math.round(((HEROES.byunghwa.skill && HEROES.byunghwa.skill.atk) || 0.35) * 100);
      o.rm = typeof document !== 'undefined' && !!document.body && document.body.classList.contains('rm'); // 연출 줄이기: 막이 닫히지 않고 · 조명이 덜 움직임
      o.buffed = false;
      this.hqArt('byunghwa');
    } else if (kind === 'yoyo') { // 배현경 날씬 → 통통 (요요)
      const h = this.heroOf(g, 'hyungyeong');
      o.h = h; o.x = h ? h.x : e.x; o.y = h ? h.y : e.y;
    } else if (kind === 'hgSlam') { // 배현경 통통 몸통 박치기: 몸 잔상이 날아가 쿵
      const h = this.heroOf(g, 'hyungyeong');
      if (!h || this.list.filter((q) => q.kind === 'hgSlam').length > 3) return;
      o.h = h; o.sx = h.rx || h.x; o.sy = h.y; o.x = e.x; o.y = e.y; o.imp = false;
    } else if (kind === 'bandSlap') { // 홍정민 평소 수리: 붕대 한 장이 날아가 입구에 탁
      if (this.list.filter((q) => q.kind === 'bandSlap').length > 3) return;
      const h = this.heroOf(g, 'jungmin');
      o.sx = h ? h.rx || h.x : e.x; o.sy = h ? h.y - 34 : g.ropeY + 60;
      const W = g.W || 360;
      o.x = Math.max(40, Math.min(W - 40, o.sx + (Math.random() - 0.5) * 120)); o.y = g.ropeY - 34 - Math.random() * 40; o.an = (Math.random() - 0.5) * 1.2; o.v = e.v || 0; o.imp = false;
    }
    this.list.push(o);
  }
  // 고화질 전신 그림 (컷인용 · 처음 쓸 때 한 번 받아 둔다 · 없으면 작은 그림)
  rmOn() { return typeof document !== 'undefined' && !!document.body && document.body.classList.contains('rm'); } // 연출 줄이기
  hqArt(id) {
    const m = this._hq || (this._hq = {});
    if (!m[id] && typeof Image !== 'undefined') { const im = new Image(); im.src = `/img/lb/dexhq/${id}.webp${id === 'subin' ? '?v=2' : ''}`; m[id] = im; }
    return m[id] && imgOk(m[id]) ? m[id] : null;
  }

  draw(layer, g) {
    if (!g) return;
    if (g !== this._ysG) { this.ys = []; this.lt = []; this._ysG = g; }
    if (layer === 'top' && this.ys && this.ys.length) this.drawYs(g);
    if (layer === 'top' && this.lt && this.lt.length) this.drawLt(g); // 가벼운 평타 연출 (저주 번개 · 소주병 휘두름)
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

  // ── 문동한: 카페인 풀충전 ──────────────────────
  //  변신(wind): 화면 어둡게 · 커피 원샷 "꿀꺽 꿀꺽" + 머리 위 카페인 배터리가 0 → 100% → 눈 번쩍 "카페인 풀충전!!" · 크림색 번쩍 · 커피색 충격파 · 원두가 튄다
  //  캔커피 부르는 동안: 발밑 따뜻한 커피빛 · 몸을 감는 커피 김 · 머리 위로 피어오르는 김 · 머리 옆 카페인 떨림 표시(///) · 원두 두 알이 둥둥
  //  (연출 줄이기: 번쩍 · 흔들림 · 떨림 표시 없이 · 김과 빛은 잔잔하게)
  bean(x, y, s, rot, a, col = '#5b3418') { // 원두 한 알 (가운데 홈)
    if (a <= 0.01) return;
    const cx = this.R.cx;
    cx.save(); cx.translate(x, y); cx.rotate(rot); cx.globalAlpha = c01(a);
    cx.fillStyle = col; cx.beginPath(); cx.ellipse(0, 0, s, s * 0.72, 0, 0, TAU); cx.fill();
    cx.strokeStyle = 'rgba(255,226,180,0.55)'; cx.lineWidth = Math.max(1, s * 0.18); cx.beginPath(); cx.moveTo(-s * 0.7, -s * 0.1); cx.quadraticCurveTo(0, s * 0.25, s * 0.7, -s * 0.1); cx.stroke();
    cx.restore();
  }
  battery(x, y, k, a, blink) { // 카페인 배터리 (머리 위) — k: 0~1 충전량
    if (a <= 0.01) return;
    const cx = this.R.cx, w = 46, h = 18, full = k >= 1;
    cx.save(); cx.translate(x, y); cx.globalAlpha = c01(a);
    cx.fillStyle = 'rgba(30,18,10,0.82)'; cx.strokeStyle = full ? '#ffe2a8' : '#f3e2c8'; cx.lineWidth = 2.2;
    cx.beginPath(); cx.roundRect(-w / 2, -h / 2, w, h, 4); cx.fill(); cx.stroke();
    cx.fillStyle = cx.strokeStyle; cx.fillRect(w / 2 + 1, -h / 4, 3.5, h / 2);
    const fw = (w - 6) * c01(k), gr = cx.createLinearGradient(0, -h / 2, 0, h / 2);
    gr.addColorStop(0, full ? '#ffd27a' : '#c98a4a'); gr.addColorStop(1, full ? '#c8742c' : '#7a4520');
    cx.fillStyle = gr; cx.globalAlpha = c01(a) * (full && blink ? 0.75 + 0.25 * Math.sin(blink * 22) : 1);
    if (fw > 0.5) { cx.beginPath(); cx.roundRect(-w / 2 + 3, -h / 2 + 3, fw, h - 6, 2); cx.fill(); }
    cx.globalAlpha = c01(a); cx.fillStyle = '#fff8ec'; cx.font = `900 11px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(`${Math.round(c01(k) * 100)}%`, 0, 0.5);
    cx.restore();
  }
  jitter(x, y, side, a) { // 카페인 떨림 표시 (머리 옆 짧은 빗금 세 개)
    if (a <= 0.01) return;
    const cx = this.R.cx;
    cx.save(); cx.globalAlpha = c01(a); cx.strokeStyle = '#fff3dc'; cx.lineWidth = 2.4; cx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const yy = y - 8 + i * 8, xx = x + side * (i % 2 ? 3 : 0); cx.beginPath(); cx.moveTo(xx, yy); cx.lineTo(xx + side * 9, yy - 4); cx.stroke(); }
    cx.restore();
  }
  cafe(layer, o, T, g) {
    const fx = this.fx, cx = this.R.cx, h = o.h;
    if (!h || h.gone || !g.heroes.includes(h)) { o.done = true; return; }
    const on = h.cafeT > 0, hx = h.rx || h.x, hy = h.y, wind = o.wind;
    if (!on && T > wind) { o.endT = o.endT || T; if (T - o.endT > 0.5) { o.done = true; return; } }
    const fade = o.endT ? 1 - c01((T - o.endT) / 0.5) : 1;
    const fullAt = wind * 0.45, it = T - fullAt; // 풀충전 순간 (변신 띠: 마시기 → 눈 번쩍)
    const charge = c01(T / fullAt);
    if (layer === 'ground') {
      if (!o.gulp && T > 0.04) { o.gulp = 1; fx.text(hx + 26, hy - 70, '꿀꺽', '#e9d3b0', 13, 0.5, -26); }
      if (o.gulp === 1 && T > fullAt * 0.55) { o.gulp = 2; fx.text(hx - 24, hy - 78, '꿀꺽!', '#e9d3b0', 14, 0.5, -26); }
      if (!o.full && T >= fullAt) {
        o.full = true;
        if (!o.rm) { fx.flash('#fff1dc', 0.4); fx.addShake(9); if (!g.pvp && !(fx.slowmo > 0)) { fx.slowmo = 0.16; fx.zoomTarget = 1.05; fx.zx = hx; fx.zy = hy - 40; } }
        fx.burst(hx, hy - 34, o.busy ? 6 : 14, '#fff4e2', 200, 'dot', 3.5, 0.6, -40);
        o.beans = Array.from({ length: o.busy ? 4 : 9 }, (_, i) => ({ an: (i / 9) * TAU + Math.random() * 0.4, sp: 120 + Math.random() * 90, rot: Math.random() * TAU }));
        fx.text(hx, hy - 108, '번쩍!', '#ffd9a0', 20, 0.9, -18); // (이름은 띠에 크게)
      }
    }
    if (layer === 'screen') {
      if (T < wind + 0.3) { const [sx, sy] = this.scr(hx, hy - 20); this.dim(sx, sy, 0.45 * (T < wind ? c01(T / 0.2) : 1 - c01((T - wind) / 0.3)), 60, 300, '20,10,4'); }
      return;
    }
    const big = it < 0 ? charge * 0.45 : it < 0.15 ? 0.55 + (it / 0.15) * 0.55 : 1.1 - c01((it - 0.15) / 0.4) * 0.2;
    const pulse = o.rm ? 1 : 1 + Math.sin(T * 9) * 0.05;
    const stT = o.rm ? 0.8 : T, stA = fade * (it > 0 ? 1 : 0.5);
    if (layer === 'ground') {
      this.glow(hx, hy + HERO_FEET, (46 + big * 30) * pulse, 'rgba(200,120,60,1)', (0.35 + big * 0.3) * fade, 0.36); // 따뜻한 커피빛 (발밑)
      if (it > 0 && it < 0.7) { const k = it / 0.7; this.flatRing(hx, hy + HERO_FEET, 18 + eOut(k) * 170, 13, 'rgba(190,120,60,1)', 1 - k); this.flatRing(hx, hy + HERO_FEET, 10 + eOut(c01(k * 1.3)) * 110, 7, 'rgba(255,236,206,1)', (1 - k) * 0.8); }
      if (T > 0.08 && fade > 0) this.steam(hx, hy, stT, stA, true); // 김 뒤쪽 반
      return;
    }
    if (layer === 'mid') {
      if (T > 0.08 && fade > 0) this.steam(hx, hy, stT, stA, false); // 김 앞쪽 반
      if (it > 0 && big > 0.02) this.glow(hx, hy - 30, 54 * big * pulse, 'rgba(255,200,140,1)', 0.32 * fade, 1.2); // 몸에 도는 카페인 기운
      return;
    }
    if (layer === 'top') {
      // 머리 위 카페인 배터리 (충전 → 100% 깜빡 → 사라짐)
      const ba = it < 0 ? c01(T / 0.12) : 1 - c01((it - 0.55) / 0.3);
      this.battery(hx, hy - HERO_TOP - 30, charge, ba * fade, o.rm ? 0 : it > 0 ? it : 0);
      // 풀충전 순간 튀어 오르는 원두
      if (o.beans && it < 0.9) for (const b of o.beans) { const k = it / 0.9, d = b.sp * eOut(k) * 0.55; this.bean(hx + Math.cos(b.an) * d, hy - 30 + Math.sin(b.an) * d * 0.7 + k * k * 60, 4.2, b.rot + (o.rm ? 0 : it * 9), 1 - k); }
      if (it > 0 && on) {
        // 머리 위로 피어오르는 김 세 가닥 (머리가 뜨겁다)
        const n = o.busy ? 2 : 3;
        for (let i = 0; i < n; i++) { const ph = ((o.rm ? 0.5 : T * 0.9) + i / n) % 1, px = hx - 10 + i * 10 + Math.sin(ph * 6 + i) * 5, py = hy - HERO_TOP - 4 - ph * 34; this.glow(px, py, 7 + ph * 9, 'rgba(255,246,232,1)', (1 - ph) * 0.45 * fade, 1); }
        // 카페인 떨림 (///) — 머리 양옆에서 번갈아
        if (!o.rm && !o.busy) { const s = Math.floor(T * 7) % 2 ? 1 : -1; this.jitter(hx + s * 24, hy - HERO_TOP + 6, s, 0.85 * fade); }
        // 둥둥 떠도는 원두 두 알
        if (!o.busy) for (let i = 0; i < 2; i++) { const an = (o.rm ? 1 : T * 1.6) + i * Math.PI; this.bean(hx + Math.cos(an) * 30, hy - 26 + Math.sin(an) * 9, 3.6, an, 0.85 * fade); }
      }
      if (it > 0 && it < 0.35) { const k = it / 0.35; cx.save(); cx.globalAlpha = 1 - k; cx.strokeStyle = '#ffe9c8'; cx.lineWidth = 5 * (1 - k) + 1; cx.beginPath(); cx.arc(hx, hy - 26, 22 + eOut(k) * 80, 0, TAU); cx.stroke(); cx.restore(); }
    }
  }
  can(x, y, s, rot, a, col) { // 캔커피 한 캔 (기울기 rot · col = [옆 그늘, 가운데, 띠])
    if (a <= 0.01) return;
    const cx = this.R.cx, w = s * 0.62, h = s;
    cx.save(); cx.translate(x, y); cx.rotate(rot); cx.globalAlpha = c01(a);
    const gr = cx.createLinearGradient(-w / 2, 0, w / 2, 0); gr.addColorStop(0, col[0]); gr.addColorStop(0.45, col[1]); gr.addColorStop(1, col[0]);
    cx.fillStyle = gr; cx.beginPath(); cx.roundRect(-w / 2, -h / 2, w, h, w * 0.18); cx.fill();
    cx.fillStyle = '#d9d4cc'; cx.fillRect(-w / 2, -h / 2, w, h * 0.1); cx.fillRect(-w / 2, h / 2 - h * 0.08, w, h * 0.08); // 위아래 알루미늄 테
    cx.fillStyle = col[2]; cx.fillRect(-w / 2, -h * 0.12, w, h * 0.26); // 가운데 띠
    cx.fillStyle = '#5a3214'; cx.beginPath(); cx.ellipse(0, h * 0.01, w * 0.17, w * 0.12, 0, 0, TAU); cx.fill(); // 원두 마크
    cx.fillStyle = 'rgba(255,255,255,0.35)'; cx.fillRect(-w * 0.3, -h * 0.38, w * 0.1, h * 0.7); // 반사광
    cx.restore();
  }
  cafeMark(layer, o, T0, g) {
    const T = g.t - o.st0, d = o.delay, cx = this.R.cx, x = o.x, y = o.y, r = o.r;
    if (T > d + 0.7 || T < -0.1) { o.done = true; return; }
    if (!o.col) o.col = CAN_COL[Math.floor(Math.random() * CAN_COL.length)];
    if (layer === 'ground') {
      if (T < d) { // 예고: 커피 얼룩 고리 (진한 테두리 + 안쪽 크림 선) · 안쪽이 차오름 · 떨어지는 캔 그림자
        const k = c01(T / d), bl = o.rm ? 1 : 0.8 + 0.2 * Math.sin(T * 26);
        cx.save(); cx.translate(x, y); cx.scale(1, 0.42);
        cx.globalAlpha = 0.16 + 0.22 * k; cx.fillStyle = 'rgba(110,62,26,1)'; cx.beginPath(); cx.arc(0, 0, r * k, 0, TAU); cx.fill();
        cx.globalAlpha = 0.9 * bl; cx.strokeStyle = 'rgba(120,70,30,1)'; cx.lineWidth = 4; cx.beginPath(); cx.arc(0, 0, r, 0, TAU); cx.stroke();
        cx.globalAlpha = 0.55 * bl; cx.strokeStyle = 'rgba(255,226,180,1)'; cx.lineWidth = 1.6; cx.beginPath(); cx.arc(0, 0, r * 0.9, 0.3, TAU - 0.6); cx.stroke();
        cx.globalAlpha = 0.25 + 0.35 * k; cx.fillStyle = '#140a04'; cx.beginPath(); cx.arc(0, 0, 6 + 12 * k, 0, TAU); cx.fill(); // 캔 그림자 (가까워질수록 커짐)
        cx.restore();
      } else { // 쏟아진 자리: 커피 웅덩이 + 크림 고리
        const k = c01((T - d) / 0.7);
        this.flatRing(x, y, r * (0.5 + eOut(k) * 0.85), 11, 'rgba(230,180,120,1)', (1 - k) * 0.9, 0.42);
        cx.save(); cx.translate(x, y); cx.scale(1, 0.42); cx.globalAlpha = 0.5 * (1 - k); cx.fillStyle = '#3a1e0c';
        cx.beginPath(); for (let i = 0; i <= 12; i++) { const an = (i / 12) * TAU, rr = r * (0.5 + 0.08 * Math.sin(i * 2.7 + x)); if (i) cx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); else cx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr); } cx.closePath(); cx.fill();
        cx.restore();
      }
      return;
    }
    if (layer === 'top') {
      const FALL = 0.32;
      if (T < d && T > d - FALL) { // 하늘에서 떨어지는 캔 + 잔상 줄
        const k = eIn(c01((T - (d - FALL)) / FALL)), top = -50, cyy = top + (y - 14 - top) * k, s = 26 + 6 * k;
        cx.save(); cx.globalAlpha = 0.45 * k; cx.strokeStyle = 'rgba(255,240,220,1)'; cx.lineWidth = 2; cx.lineCap = 'round';
        for (let i = -1; i <= 1; i++) { cx.beginPath(); cx.moveTo(x + i * 7, cyy - s * 0.6); cx.lineTo(x + i * 7, cyy - s * 0.6 - 30 - 20 * k); cx.stroke(); }
        cx.restore();
        this.can(x, cyy, s, o.rm ? 0.2 : 0.25 + T * 6, 1, o.col);
      }
      if (T >= d) { // 쾅 — 캔이 터지며 커피가 왕관 모양으로 튄다 · 크림 거품 · 김
        const k = c01((T - d) / 0.45);
        this.glow(x, y - 8, r * (0.7 + k * 0.4), 'rgba(255,214,170,1)', (1 - k) * 0.7, 0.7);
        if (!o.drops) { const n = o.busy ? 6 : 11; o.drops = Array.from({ length: n }, (_, i) => ({ an: Math.PI + (i / (n - 1)) * Math.PI + (Math.random() - 0.5) * 0.25, sp: 0.6 + Math.random() * 0.5, s: 2.5 + Math.random() * 3 })); }
        cx.save();
        for (const p of o.drops) { const dd = r * 0.95 * p.sp * eOut(k), px = x + Math.cos(p.an) * dd, py = y - 6 + Math.sin(p.an) * dd * 0.9 + k * k * 40; cx.globalAlpha = 1 - k; cx.fillStyle = p.s > 4 ? '#e9d3b0' : '#6b3a17'; cx.beginPath(); cx.ellipse(px, py, p.s, p.s * 1.3, p.an + Math.PI / 2, 0, TAU); cx.fill(); }
        cx.restore();
        if (T - d < 0.12) this.can(x, y - 12, 30 * (1 + (T - d) * 3), 0, 1 - (T - d) / 0.12, o.col); // 찌그러지며 사라지는 캔
        const sk = c01((T - d - 0.1) / 0.6); if (sk > 0 && sk < 1) for (let i = 0; i < 2; i++) this.glow(x - 10 + i * 20, y - 20 - sk * 36, 10 + sk * 12, 'rgba(255,248,236,1)', (1 - sk) * 0.4, 1); // 김
      }
    }
  }
  // ── 김도훈: 무한 앵콜 ── 무대 조명 세 줄기가 바닥을 훑고(연출 줄이기면 가만히) · 멈춘 진상 머리 위로 떼창 음표 · "앵콜!" 함성
  encore(layer, o, T, g) {
    const R = this.R, cx = R.cx, W = R.W, END = 2.6;
    if (T > END) { o.done = true; return; }
    const show = c01(T / 0.25) * (1 - c01((T - END + 0.6) / 0.6)), t = o.rm ? 0.4 : g.t;
    const COL = ['255,90,200', '110,210,255', '255,214,110'], nSpot = o.busy ? 2 : 3;
    if (layer === 'ground') { for (let i = 0; i < nSpot; i++) { const [px, py] = this.omSpot(i, t * 1.6, W, g); this.glow(px, py, 74, `rgba(${COL[i]},1)`, 0.55 * show, 0.42); this.flatRing(px, py, 56, 5, `rgba(${COL[i]},1)`, 0.5 * show, 0.42); } return; }
    if (layer === 'mid') {
      cx.save(); cx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < nSpot; i++) { const [px, py] = this.omSpot(i, t * 1.6, W, g), ox = W * (0.1 + 0.4 * i); this.beam(ox, -40, px, py, 10, 66, COL[i], 0.16 * show); this.beam(ox, -40, px, py, 4, 36, COL[i], 0.22 * show); }
      const h = o.h && !o.h.gone ? o.h : null; if (h) { const hx = h.rx || h.x; this.beam(hx, -40, hx, h.y + HERO_FEET, 14, 54, '255,244,214', 0.16 * show); }
      cx.restore();
      return;
    }
    if (layer === 'top') {
      let n = 0; const cap = o.busy ? 8 : 22;
      for (const e of g.enemies) {
        if (e.dead || !(e.stunT > 0 || e.slowT > 0) || e.y < 20 || Math.hypot(e.x - o.x, e.y - (o.y - 60)) > o.r + 20) continue;
        if (++n > cap) break;
        const id = e.uid || n, sz = e.def ? e.def.size : 50, ph = g.t * 3 + id * 1.7, rise = o.rm ? 0 : (T * 0.9 + id * 0.31) % 1;
        this.note(e.x + sz * 0.2 + Math.sin(ph) * 6, e.y - sz * 0.6 - rise * 26, 7, id % 2 ? '#ff8ad8' : '#9fe0ff', show * (1 - rise * 0.7), Math.sin(ph) * 0.3);
      }
      if (!o.busy && !o.chant && T > 0.3) { o.chant = true; for (let k = 0; k < 3; k++) setTimeout(() => this.fx.text(40 + Math.random() * (W - 80), 150 + Math.random() * 120, '앵콜!', ['#ff9fe6', '#ffe14d', '#9fe0ff'][k], 15, 0.9, -20), k * 380); } // 진상들 떼창
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

  // ── 강병화: 원맨쇼 ──────────────────────────
  //  컷인(기운 분홍 띠 · 고화질 윗몸 · "원맨쇼!!") 뒤로 붉은 막이 닫혔다가 촤악 열림 → 무대 조명:
  //  바닥만 보라로 어둡게(캐릭터는 밝게 남음) · 색 스포트라이트가 무대를 훑고 · 강병화에게 핀 조명 · 미러볼 반짝이 · 춤추는 진상 머리 위 음표 (춤 동작은 render.js)
  //  위 휘장 · 양옆 커튼은 원맨쇼 동안 남았다가 끝나면 걷힌다. 컷인 · 막은 화면 시간 · 조명은 게임 시간(g.onemanT · 멈추면 같이 멈춤)
  omSpot(i, t, W, g) { // 스포트라이트 i 가 비추는 바닥 자리
    const sp = 0.7 + i * 0.23, ph = i * 2.1;
    return [W * (0.22 + 0.28 * i) + Math.sin(t * sp + ph) * W * 0.24, 170 + (Math.sin(t * sp * 0.63 + ph * 1.3) * 0.5 + 0.5) * Math.max(60, g.ropeY - 230)];
  }
  oneman(layer, o, T, g) {
    const R = this.R, cx = R.cx, W = R.W, H = R.H, h = o.h && !o.h.gone && g.heroes.includes(o.h) ? o.h : null;
    const left = g.onemanT || 0;
    const endK = T < 1.1 ? 1 : c01(left / 0.45); // 끝날 때 0.45초 동안 걷힘
    if (T >= 1.1 && endK <= 0) { o.done = true; return; }
    const show = c01((T - 0.62) / 0.35) * endK; // 무대 조명 세기 (막이 열리며 켜짐)
    const t = o.rm ? 0.3 : g.t, hx = h ? h.rx || h.x : o.x, hy = h ? h.y : o.y;
    const COL = ['255,90,200', '110,210,255', '255,214,110'], nSpot = o.busy ? 2 : 3;
    if (layer === 'ground') {
      if (show <= 0.01) return;
      cx.save(); cx.globalCompositeOperation = 'multiply'; cx.globalAlpha = 0.6 * show; cx.fillStyle = '#4a2a86'; cx.fillRect(-40, -60, W + 80, H + 120); cx.restore(); // 바닥만 보라로 어둡게
      for (let i = 0; i < nSpot; i++) { const [px, py] = this.omSpot(i, t, W, g); this.glow(px, py, 70, `rgba(${COL[i]},1)`, 0.6 * show, 0.42); this.flatRing(px, py, 54, 5, `rgba(${COL[i]},1)`, 0.55 * show, 0.42); }
      this.glow(hx, hy + HERO_FEET, 62, 'rgba(255,240,200,1)', 0.85 * show, 0.4); // 핀 조명 바닥
      return;
    }
    if (layer === 'mid') {
      if (show <= 0.01) return;
      cx.save(); cx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < nSpot; i++) { const [px, py] = this.omSpot(i, t, W, g), ox = W * (0.1 + 0.4 * i); this.beam(ox, -40, px, py, 10, 64, COL[i], 0.16 * show); this.beam(ox, -40, px, py, 4, 36, COL[i], 0.22 * show); }
      this.beam(hx, -40, hx, hy + HERO_FEET, 14, 54, '255,244,214', 0.14 * show); this.beam(hx, -40, hx, hy + HERO_FEET, 6, 32, '255,250,230', 0.2 * show); // 핀 조명
      cx.restore();
      if (!o.busy && !o.rm) for (let i = 0; i < 10; i++) { const u = g.t * 0.7 + i * 0.37, ph = u % 1, cyc = Math.floor(u), px = 10 + ((i * 97.3 + cyc * 53.1) % (W - 20)), py = 110 + ((i * 61.7 + cyc * 31.3) % Math.max(80, g.ropeY - 130)); this.star4(px, py, 5 + (i % 3) * 2, ph * 2, `rgba(${COL[i % 3]},1)`, Math.sin(ph * Math.PI) * show * 0.9); } // 미러볼 반짝이
      return;
    }
    if (layer === 'top') {
      if (!o.buffed && T > 0.75) { o.buffed = true; for (const q of g.heroes) if (!q.gone && !q.def.summon) this.fx.text(q.rx || q.x, q.y - 64, `공격 +${o.atk}%`, '#ffb0e0', 12, 1.1, -26); } // 막이 열릴 때 멤버마다
      if (show > 0.01) { // 춤추는 진상 머리 위 음표
        let n = 0; const cap = o.busy ? 8 : 24;
        for (const e of g.enemies) {
          if (e.dead || !(e.danceT > 0) || !(e.stunT > 0) || e.y < 20) continue;
          if (++n > cap) break;
          const sz = e.def ? e.def.size : 50, ph = g.t * 3 + e.uid * 1.7;
          this.note(e.x + sz * 0.26 + Math.sin(ph) * 5, e.y - sz * 0.62 - Math.abs(Math.sin(ph * 1.3)) * 7, 7, e.uid % 2 ? '#ff8ad8' : '#9fe0ff', show * 0.95, Math.sin(ph) * 0.3);
        }
      }
      return;
    }
    if (layer !== 'screen') return;
    // 막: 양옆 커튼 (닫힘 → 열림 · 열린 뒤 양옆에 묶여 남음) + 위 휘장
    const D = 22;
    let xi;
    if (o.rm) xi = D * c01(T / 0.3) * endK;
    else if (T < 0.2) xi = (W / 2) * eIn(T / 0.2);
    else if (T < 0.62) xi = W / 2;
    else xi = (W / 2 + (D - W / 2) * eOut(c01((T - 0.62) / 0.42))) * (T > 1.1 ? endK : 1);
    const pinch = o.rm ? 0.6 : c01((T - 0.62) / 0.42) * 0.6;
    if (xi > 0.5) { this.curtain(xi, H, pinch); cx.save(); cx.translate(W, 0); cx.scale(-1, 1); this.curtain(xi, H, pinch); cx.restore(); }
    if (!o.rm && T > 0.12 && T < 0.8) { const k = T < 0.62 ? c01((T - 0.12) / 0.15) : 1 - c01((T - 0.62) / 0.18); this.glow(W / 2, H * 0.66, 110, 'rgba(255,236,200,1)', 0.4 * k, 1.15); } // 닫힌 막에 동그란 조명
    this.valance(W, (eOut(c01(T / 0.25)) - 1) * 90 + (T > 1.1 ? (endK - 1) * 100 : 0));
    if (T < 1.05) this.omCutIn(o, T, W, H);
  }
  beam(x0, y0, x1, y1, w0, w1, col, a) { // 조명 줄기 (위가 좁고 바닥이 넓음 · 바닥 쪽이 밝음) — 부르는 쪽에서 더하기 합성
    if (a <= 0.01) return;
    const cx = this.R.cx, dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const gr = cx.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(0.45, `rgba(${col},0.5)`); gr.addColorStop(1, `rgba(${col},1)`);
    cx.globalAlpha = c01(a); cx.fillStyle = gr;
    cx.beginPath(); cx.moveTo(x0 + nx * w0, y0 + ny * w0); cx.lineTo(x1 + nx * w1, y1 + ny * w1 * 0.4); cx.lineTo(x1 - nx * w1, y1 - ny * w1 * 0.4); cx.lineTo(x0 - nx * w0, y0 - ny * w0); cx.closePath(); cx.fill();
  }
  note(x, y, s, col, a, rot = 0) { // 음표 (코드 그림)
    if (a <= 0.01) return;
    const cx = this.R.cx;
    cx.save(); cx.translate(x, y); cx.rotate(rot); cx.globalAlpha = c01(a); cx.lineCap = 'round';
    const stem = () => { cx.beginPath(); cx.moveTo(s * 0.05, s * 0.5); cx.lineTo(s * 0.05, -s * 0.95); cx.quadraticCurveTo(s * 0.75, -s * 0.6, s * 0.6, -s * 0.05); };
    cx.strokeStyle = 'rgba(30,8,40,0.9)'; cx.lineWidth = 3.4; stem(); cx.stroke();
    cx.strokeStyle = col; cx.lineWidth = 1.6; stem(); cx.stroke();
    cx.fillStyle = col; cx.strokeStyle = 'rgba(30,8,40,0.9)'; cx.lineWidth = 1.4;
    cx.beginPath(); cx.ellipse(-s * 0.3, s * 0.55, s * 0.42, s * 0.3, -0.45, 0, TAU); cx.fill(); cx.stroke();
    cx.restore();
  }
  curtain(xi, H, pinch) { // 붉은 벨벳 커튼 (왼쪽 · 오른쪽은 뒤집어서) — 주름 수가 그대로라 걷히면 촘촘하게 몰림 · 열리면 허리를 금 끈으로 묶음
    const cx = this.R.cx, mid = H * 0.6, xm = xi * (1 - pinch * 0.6), xb = xi * (1 + pinch * 0.3);
    cx.save();
    const gr = cx.createLinearGradient(0, 0, xi, 0), N = 7;
    for (let i = 0; i < N; i++) { const u = i / N, s = 1 / N; gr.addColorStop(u, '#4e0512'); gr.addColorStop(u + s * 0.4, '#b8183a'); gr.addColorStop(u + s * 0.62, '#ea4a66'); gr.addColorStop(u + s * 0.88, '#80091f'); }
    gr.addColorStop(1, '#4e0512');
    cx.fillStyle = gr;
    cx.beginPath(); cx.moveTo(-4, -4); cx.lineTo(xi, -4); cx.quadraticCurveTo(xm, mid, xb, H + 4); cx.lineTo(-4, H + 4); cx.closePath(); cx.fill();
    cx.strokeStyle = 'rgba(20,0,6,0.45)'; cx.lineWidth = 4; cx.beginPath(); cx.moveTo(xi, -4); cx.quadraticCurveTo(xm, mid, xb, H + 4); cx.stroke(); // 안쪽 그림자
    cx.strokeStyle = '#ffcf4a'; cx.lineWidth = 1.6; cx.beginPath(); cx.moveTo(xi - 1.5, -4); cx.quadraticCurveTo(xm - 1.5, mid, xb - 1.5, H + 4); cx.stroke(); // 금 테
    if (pinch > 0.25) { const ty = mid * 0.97, tx = (xi + 2 * xm + xb) / 4; cx.fillStyle = '#ffd24a'; cx.strokeStyle = '#7a4a00'; cx.lineWidth = 1.2; cx.beginPath(); cx.ellipse(tx * 0.5, ty, tx * 0.62 + 3, 4, 0, 0, TAU); cx.fill(); cx.stroke(); cx.beginPath(); cx.arc(tx + 2, ty + 7, 3.2, 0, TAU); cx.fill(); cx.stroke(); cx.fillRect(tx + 1, ty + 9, 2, 10); } // 금 끈 · 술
    cx.restore();
  }
  valance(W, vy) { // 위 휘장 (물결 붉은 천 + 금 테 · 술)
    const cx = this.R.cx, h0 = 64 + vy, n = 6, sw = W / n;
    if (h0 < -24) return;
    const edge = () => { for (let i = n - 1; i >= 0; i--) cx.quadraticCurveTo(i * sw + sw / 2, h0 + 22, i * sw, h0); };
    cx.save();
    const gr = cx.createLinearGradient(0, h0 - 64, 0, h0 + 12); gr.addColorStop(0, 'rgba(60,4,18,0.92)'); gr.addColorStop(0.65, 'rgba(176,22,56,0.96)'); gr.addColorStop(1, '#7a0a22');
    cx.fillStyle = gr; cx.beginPath(); cx.moveTo(0, -10); cx.lineTo(W, -10); cx.lineTo(W, h0); edge(); cx.closePath(); cx.fill();
    cx.strokeStyle = '#ffcf4a'; cx.lineWidth = 2.5; cx.beginPath(); cx.moveTo(W, h0); edge(); cx.stroke();
    cx.fillStyle = '#ffd65a'; for (let i = 0; i <= n; i++) { cx.beginPath(); cx.arc(i * sw, h0 + 3, 3.4, 0, TAU); cx.fill(); cx.fillRect(i * sw - 1, h0 + 3, 2, 10); }
    cx.restore();
  }
  omCutIn(o, T, W, H) { // 컷인: 기운 분홍 띠가 오른쪽에서 쑥 → 윗몸 그림(머리가 띠 위로 삐져나옴) · 이름 → 왼쪽으로 쓱
    const cx = this.R.cx, cy = H * 0.44, bh = 92, sk = 24;
    const kin = eOut(c01((T - 0.04) / 0.16)), kout = eIn(c01((T - 0.86) / 0.17));
    if (kin <= 0 || kout >= 1) return;
    const off = (1 - kin) * W * 1.15 - kout * W * 1.15;
    const band = () => { cx.beginPath(); cx.moveTo(-30, cy - bh / 2 + sk); cx.lineTo(W + 30, cy - bh / 2 - sk); cx.lineTo(W + 30, cy + bh / 2 - sk); cx.lineTo(-30, cy + bh / 2 + sk); cx.closePath(); };
    cx.save(); cx.translate(off, 0);
    cx.globalAlpha = 0.35; cx.fillStyle = '#000'; cx.save(); cx.translate(0, 8); band(); cx.fill(); cx.restore(); cx.globalAlpha = 1; // 그림자
    const gr = cx.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#6a1cc8'); gr.addColorStop(0.5, '#d42c92'); gr.addColorStop(1, '#ff79b6');
    cx.fillStyle = gr; band(); cx.fill();
    cx.save(); band(); cx.clip(); cx.globalCompositeOperation = 'lighter'; cx.fillStyle = '#fff'; // 속도선
    for (let i = 0; i < 12; i++) { const y = cy - bh / 2 - sk + ((i * 37) % (bh + sk * 2)), len = 40 + ((i * 23) % 70), x = W + 40 - ((T * 900 + i * 131) % (W + 160)); cx.globalAlpha = 0.18 + (i % 3) * 0.1; cx.fillRect(x, y, len, 1.5 + (i % 2)); }
    cx.restore();
    cx.strokeStyle = '#ffe27a'; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(-30, cy - bh / 2 + sk); cx.lineTo(W + 30, cy - bh / 2 - sk); cx.moveTo(-30, cy + bh / 2 + sk); cx.lineTo(W + 30, cy + bh / 2 - sk); cx.stroke();
    // 윗몸 그림: 띠 아래 선 위쪽만 (머리 · 뻗은 손은 띠 밖으로)
    const im = this.hqArt('byunghwa'), lo = this.R.images && this.R.images.h_byunghwa, px = W * 0.02 + (1 - kin) * 50, bot = cy + bh / 2 + sk * 0.55;
    cx.save(); cx.beginPath(); cx.moveTo(-30, -400); cx.lineTo(W + 30, -400); cx.lineTo(W + 30, cy + bh / 2 - sk); cx.lineTo(-30, cy + bh / 2 + sk); cx.closePath(); cx.clip();
    if (im) { const dh = 176, dw = dh * 700 / 640; cx.drawImage(im, 60, 0, 700, 640, px, bot - dh, dw, dh); }
    else if (imgOk(lo)) { const dh = 176, dw = dh * 220 / 140; cx.drawImage(lo, 18, 0, 220, 140, px, bot - dh, dw, dh); }
    cx.restore();
    const tx = W * 0.68, ty = cy - sk * 0.36, tsc = T < 0.32 ? Math.max(0.01, eBack(c01((T - 0.1) / 0.22))) : 1;
    this.label(tx, ty - 26, 'LEGEND · 강병화', 11, '#fff2fa', '#4a0832', 1, 1);
    this.label(tx, ty + 2, '원맨쇼!!', 34, '#ffffff', '#86083f', 1, tsc);
    this.label(tx, ty + 30, `${o.sec}초 · 보스 빼고 모두 춤 · 공격 +${o.atk}%`, 10, '#ffe6f3', '#4a0832', 1, 1);
    cx.restore();
  }

  // ── 배현경: 요요 (날씬 → 통통) ─────────────────
  //  뻥! 살구색 연기가 몸을 감쌌다 부풀며 걷힘(그 사이 통통으로) · 바닥 고리 · 터지는 고리 · 땀방울
  yoyo(layer, o, T, g) {
    if (T > 0.9) { o.done = true; return; }
    const cx = this.R.cx, h = o.h && !o.h.gone ? o.h : null, hx = h ? h.rx || h.x : o.x, hy = h ? h.y : o.y;
    if (layer === 'ground') { const k = c01(T / 0.5); if (k < 1) this.flatRing(hx, hy + HERO_FEET, 16 + eOut(k) * 74, 9, 'rgba(255,170,90,1)', (1 - k) * 0.9); return; }
    if (layer === 'mid') {
      const k = T / 0.7; if (k >= 1) return;
      const n = o.busy ? 6 : 10;
      for (let i = 0; i < n; i++) {
        const an = i * TAU / n + 0.4, rr = 8 + eOut(k) * (30 + (i % 3) * 9), px = hx + Math.cos(an) * rr, py = hy - 16 + Math.sin(an) * rr * 0.75, r = (15 + (i % 3) * 5) * (0.7 + eOut(k) * 0.7);
        cx.save(); cx.globalAlpha = (1 - k) * (k < 0.12 ? k / 0.12 : 1) * 0.88;
        const gr = cx.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, i % 2 ? 'rgba(255,246,232,1)' : 'rgba(255,214,170,1)'); gr.addColorStop(0.6, 'rgba(255,200,150,0.72)'); gr.addColorStop(1, 'rgba(255,190,140,0)');
        cx.fillStyle = gr; cx.beginPath(); cx.arc(px, py, r, 0, TAU); cx.fill(); cx.restore();
      }
      return;
    }
    if (layer !== 'top') return;
    if (T < 0.35) { const k = T / 0.35; cx.save(); cx.globalAlpha = 1 - k; cx.strokeStyle = '#ffe2c0'; cx.lineWidth = 5 * (1 - k) + 1; cx.beginPath(); cx.arc(hx, hy - 20, 14 + eOut(k) * 52, 0, TAU); cx.stroke(); cx.restore(); }
    if (T < 0.5) this.label(hx, hy - 58 - eOut(c01(T / 0.3)) * 10, '뻥!', 15, '#fff1dc', '#8a3a00', 1 - c01((T - 0.35) / 0.15), T < 0.12 ? Math.max(0.01, eBack(T / 0.12)) : 1);
    for (let i = 0; i < 3; i++) { const k = c01((T - 0.15 - i * 0.08) / 0.55); if (k <= 0 || k >= 1) continue; const sd = i === 1 ? 1 : -1; this.drop(hx + sd * (24 + i * 4 + k * 14), hy - 50 + k * k * 30, 4.5, '#9fdcff', 1 - k); }
  }
  drop(x, y, s, col, a) { // 땀방울
    if (a <= 0.01) return;
    const cx = this.R.cx;
    cx.save(); cx.globalAlpha = c01(a); cx.fillStyle = col; cx.strokeStyle = 'rgba(20,40,80,0.8)'; cx.lineWidth = 1.2;
    cx.beginPath(); cx.moveTo(x, y - s * 1.6); cx.quadraticCurveTo(x + s, y - s * 0.2, x, y + s); cx.quadraticCurveTo(x - s, y - s * 0.2, x, y - s * 1.6); cx.fill(); cx.stroke();
    cx.fillStyle = 'rgba(255,255,255,0.85)'; cx.beginPath(); cx.arc(x - s * 0.3, y, s * 0.25, 0, TAU); cx.fill();
    cx.restore();
  }
  // ── 배현경 통통: 몸통 박치기 ─────────────────
  //  몸 잔상(통통 그림)이 진상에게 휙 날아가 쿵 — 납작하게 눌렸다 사라짐 · 바닥 금 · 흙먼지 고리 (날씬 잽은 render.js 글러브)
  hgSlam(layer, o, T, g) {
    const FLY = 0.11, END = FLY + 0.45;
    if (T > END) { o.done = true; return; }
    const cx = this.R.cx, fx = this.fx, it = T - FLY, feet = o.y + 14;
    if (it >= 0 && !o.imp) {
      o.imp = true;
      fx.burst(o.x, o.y + 6, o.busy ? 5 : 10, 'rgba(210,180,140,0.85)', 130, 'puff', 10, 0.45);
      fx.burst(o.x, o.y - 10, o.busy ? 3 : 6, '#ffd08a', 200, 'spark', 4, 0.3);
      if (Math.random() < 0.4) fx.text(o.x, o.y - 34, '쿵!', '#ffd08a', 17, 0.6, -30);
      fx.addShake(3);
    }
    if (layer === 'ground') {
      if (it < 0) return;
      const k = c01(it / 0.45);
      this.flatRing(o.x, feet, 12 + eOut(k) * 58, 8, 'rgba(255,190,120,1)', (1 - k) * 0.85);
      cx.save(); cx.translate(o.x, feet); cx.scale(1, 0.4); cx.globalAlpha = (1 - k) * 0.75; cx.strokeStyle = 'rgba(50,24,8,0.95)'; cx.lineWidth = 2.4; cx.lineCap = 'round'; cx.lineJoin = 'round';
      for (let i = 0; i < 6; i++) { const an = i * TAU / 6 + 0.3, r1 = 26 + (i % 2) * 12; cx.beginPath(); cx.moveTo(Math.cos(an) * 7, Math.sin(an) * 7); cx.lineTo(Math.cos(an + 0.18) * r1 * 0.55, Math.sin(an + 0.18) * r1 * 0.55); cx.lineTo(Math.cos(an) * r1, Math.sin(an) * r1); cx.stroke(); } // 바닥 금
      cx.restore();
      return;
    }
    if (layer !== 'mid') return;
    const sp = this.R.sprites && this.R.sprites.h_hyungyeong;
    if (!sp) return;
    const S = 72;
    let x, y, sx = 1, sy = 1, a;
    if (it < 0) { const k = eIn(T / FLY); x = o.sx + (o.x - o.sx) * k; y = o.sy + (o.y - o.sy) * k - Math.sin(k * Math.PI) * 26; sx = 0.86; sy = 1.14; a = 0.35 + k * 0.4; }
    else { const k = c01(it / 0.3); x = o.x; y = o.y; sx = 1 + 0.45 * (1 - k * 0.5); sy = 1 - 0.38 * (1 - k * 0.5); a = 0.85 * (1 - k); }
    if (a <= 0.01) return;
    if (it < 0) { cx.save(); cx.globalCompositeOperation = 'lighter'; cx.strokeStyle = 'rgba(255,190,130,1)'; cx.lineCap = 'round'; const dx = o.x - o.sx, dy = o.y - o.sy, L = Math.hypot(dx, dy) || 1; for (let i = -1; i <= 1; i++) { cx.globalAlpha = 0.5 * a; cx.lineWidth = i ? 2 : 3.5; const nx = -dy / L * i * 14, ny = dx / L * i * 14; cx.beginPath(); cx.moveTo(x - dx / L * 60 + nx, y - 4 - dy / L * 60 + ny); cx.lineTo(x + nx, y - 4 + ny); cx.stroke(); } cx.restore(); } // 날아가는 줄
    if (!this._hgGhost || this._hgGhost.src !== sp.c) { // 살구빛 잔상 그림 (한 번만 만들어 둔다)
      const c = document.createElement('canvas'); c.width = sp.c.width; c.height = sp.c.height;
      const x2 = c.getContext('2d'); x2.drawImage(sp.c, 0, 0); x2.globalCompositeOperation = 'source-atop'; x2.fillStyle = 'rgba(255,196,130,0.35)'; x2.fillRect(0, 0, c.width, c.height);
      this._hgGhost = { src: sp.c, c };
    }
    cx.save(); cx.translate(x, y + S * 0.42); cx.scale(sx, sy); cx.globalAlpha = c01(a);
    cx.drawImage(this._hgGhost.c, -S / 2, -S, S, S);
    cx.restore();
  }
  // ── 홍정민 평소 수리: 붕대 한 장이 빙글빙글 날아가 입구에 탁 붙음 (조금 남았다가 흐려짐) ──
  bandSlap(layer, o, T, g) {
    const FLY = 0.24, END = FLY + 1.4;
    if (T > END) { o.done = true; return; }
    const cx = this.R.cx;
    if (T < FLY) {
      if (layer !== 'top') return;
      const k = eOut(T / FLY), x = o.sx + (o.x - o.sx) * k, y = o.sy + (o.y - o.sy) * k - Math.sin(k * Math.PI) * 40;
      cx.save(); cx.translate(x, y); cx.rotate(T * 26); this.plaster(34, 1); cx.restore();
      return;
    }
    const it = T - FLY;
    if (!o.imp) { o.imp = true; this.fx.text(o.x + 16, o.y - 16, '탁!', '#eaffea', 13, 0.5, -30); this.fx.burst(o.x, o.y, o.busy ? 3 : 6, '#fff6e0', 110, 'dot', 3, 0.3); }
    if (layer === 'gate') {
      const sq = it < 0.12 ? 1 + (1 - it / 0.12) * 0.4 : 1, a = it > 1 ? 1 - (it - 1) / 0.4 : 1;
      cx.save(); cx.translate(o.x, o.y); cx.rotate(o.an); cx.scale(sq, 2 - sq); this.plaster(46, a); cx.restore();
      if (it < 0.3) this.glow(o.x, o.y, 34, 'rgba(120,255,160,1)', (1 - it / 0.3) * 0.6);
      return;
    }
    if (layer === 'top' && it < 0.6) {
      const k = it / 0.6, s = 5, px = o.x + 12, py = o.y - 14 - k * 26;
      cx.save(); cx.globalAlpha = Math.sin(k * Math.PI); cx.fillStyle = '#d6ffe0'; cx.strokeStyle = '#1d6b35'; cx.lineWidth = 1.5;
      cx.beginPath(); cx.rect(px - s * 0.3, py - s, s * 0.6, s * 2); cx.rect(px - s, py - s * 0.3, s * 2, s * 0.6); cx.fill(); cx.stroke(); cx.restore();
    }
  }

  plaster(L, a) { // 반창고 한 장 (가운데 기준 · 가로) — 살색 띠 + 흰 패드 + 숨구멍 · 진한 테두리라 모래주머니 위에서도 보임
    if (a <= 0.01) return;
    const cx = this.R.cx, H = L * 0.34, r = H / 2;
    cx.save(); cx.globalAlpha = c01(a);
    const rr = (x, y, w, h, q) => { cx.beginPath(); if (cx.roundRect) cx.roundRect(x, y, w, h, q); else cx.rect(x, y, w, h); };
    cx.fillStyle = 'rgba(30,10,0,0.3)'; rr(-L / 2 + 1, -r + 2.5, L, H, r); cx.fill(); // 그림자
    cx.fillStyle = '#f2c79c'; cx.strokeStyle = '#5a3418'; cx.lineWidth = 1.6; rr(-L / 2, -r, L, H, r); cx.fill(); cx.stroke();
    cx.fillStyle = '#fff6ec'; cx.strokeStyle = 'rgba(90,52,24,0.6)'; cx.lineWidth = 1; rr(-L * 0.17, -r * 0.62, L * 0.34, H * 0.62, 2); cx.fill(); cx.stroke(); // 패드
    cx.fillStyle = 'rgba(120,70,30,0.55)'; for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { cx.beginPath(); cx.arc(sx * (L * 0.27 + (i % 2) * 3), (i - 1) * r * 0.45, 0.9, 0, TAU); cx.fill(); } // 숨구멍
    cx.restore();
  }

  // ── 가벼운 평타 연출 (여러 개가 동시에 · 짧게 · 40개까지) ──
  //  서명훈 저주 번개: 들쭉날쭉 번개 줄(검은 테 · 검붉은 · 보라 · 흰 심 · 1/30초마다 모양이 바뀌며 지직) + 맞은 자리 저주 딱지 "#@!"
  //  홍정민: 거꾸로 든 소주병을 휘두르는 초승달 자국
  lightPush(q) { const a = this.lt || (this.lt = []); if (a.length > 40) a.shift(); q.t = this.fx.time; a.push(q); }
  bolt(x, y, x2, y2, busy) {
    this.lightPush({ k: 'bolt', x, y, x2, y2, seed: Math.random() * 1000, life: 0.3, rm: busy || this.rmOn() });
    if (!busy || Math.random() < 0.4) this.curse(x2, y2);
  }
  curse(x, y) { this.lightPush({ k: 'curse', x, y, life: 0.6, rot: (Math.random() - 0.5) * 0.5 }); }
  jmSwing(x, y, side) { this.lightPush({ k: 'swing', x, y, side, life: 0.2 }); }
  drawLt(g) {
    const now = this.fx.time;
    this.lt = this.lt.filter((q) => now - q.t < q.life);
    for (const q of this.lt) {
      const k = (now - q.t) / q.life;
      if (q.k === 'bolt') this.drawBolt(q, k);
      else if (q.k === 'curse') this.drawCurse(q, k);
      else if (q.k === 'swing') this.drawSwing(q, k);
    }
  }
  drawBolt(q, k) {
    const cx = this.R.cx, dx = q.x2 - q.x, dy = q.y2 - q.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const n = Math.max(4, Math.min(9, Math.round(L / 14)));
    let s = Math.floor(q.seed + Math.floor(this.fx.time * 30) * 7.31) % 233280;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const pts = [q.x, q.y];
    for (let i = 1; i < n; i++) { const u = i / n, j = (rnd() - 0.5) * Math.min(28, L * 0.3); pts.push(q.x + dx * u + nx * j, q.y + dy * u + ny * j); }
    pts.push(q.x2, q.y2);
    const path = () => { cx.beginPath(); cx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) cx.lineTo(pts[i], pts[i + 1]); };
    const a = k < 0.2 ? 1 : 1 - (k - 0.2) / 0.8, W = k < 0.12 ? 1.45 - k / 0.12 * 0.45 : 1; // 처음 한 순간 굵게 지직
    cx.save(); cx.lineJoin = 'round'; cx.lineCap = 'round';
    cx.globalAlpha = a * 0.8; cx.strokeStyle = 'rgb(22,0,18)'; cx.lineWidth = 9 * W; path(); cx.stroke(); // 검은 테 (밝은 바닥에서도 보이게)
    cx.globalCompositeOperation = 'lighter';
    if (!q.rm) { cx.globalAlpha = a * 0.3; cx.strokeStyle = 'rgb(200,50,255)'; cx.lineWidth = 18 * W; path(); cx.stroke(); } // 넓은 보라 빛 번짐
    cx.globalAlpha = a; cx.strokeStyle = 'rgb(225,40,150)'; cx.lineWidth = 5.5 * W; path(); cx.stroke(); // 자홍 몸통 (빛)
    cx.strokeStyle = 'rgb(170,90,255)'; cx.lineWidth = 3 * W; path(); cx.stroke(); // 보라 속
    cx.strokeStyle = 'rgb(255,235,255)'; cx.lineWidth = 1.4 * W; path(); cx.stroke(); // 흰 빛 심
    if (pts.length > 6) { // 곁가지 두 갈래
      for (let b = 0; b < 2; b++) { const i = 2 * (1 + Math.floor(rnd() * (n - 2))), bx = pts[i], by = pts[i + 1], ba = Math.atan2(dy, dx) + (b ? -1 : 1) * (0.6 + rnd() * 0.5), bl = 10 + rnd() * 14;
        cx.strokeStyle = 'rgb(210,90,255)'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(bx, by); cx.lineTo(bx + Math.cos(ba) * bl * 0.5 + (rnd() - 0.5) * 6, by + Math.sin(ba) * bl * 0.5 + (rnd() - 0.5) * 6); cx.lineTo(bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl); cx.stroke(); }
    }
    const gc = curseGlow(); // 맞은 자리 섬광 (미리 구운 빛 · 십자 반짝) · 입 쪽 빛
    if (gc) { let r = 26 * (1.2 - k * 0.5); cx.globalAlpha = a * 0.85; cx.drawImage(gc, q.x2 - r, q.y2 - r, r * 2, r * 2); r = 14; cx.globalAlpha = a * 0.5; cx.drawImage(gc, q.x - r, q.y - r, r * 2, r * 2); }
    if (k < 0.45) { const f = (1 - k / 0.45), L = 16 * f + 4; cx.globalAlpha = f; cx.strokeStyle = '#ffffff'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(q.x2 - L, q.y2); cx.lineTo(q.x2 + L, q.y2); cx.moveTo(q.x2, q.y2 - L * 0.8); cx.lineTo(q.x2, q.y2 + L * 0.8); cx.stroke(); }
    cx.restore();
  }
  drawCurse(q, k) { // 저주 딱지: 검은 가시 원 안에 붉은 "#@!" (톡 커졌다가 위로 흐려짐)
    const cx = this.R.cx, sc = k < 0.18 ? Math.max(0.01, eBack(k / 0.18)) : 1, a = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4, y = q.y - 18 - eOut(k) * 16;
    const gc = curseGlow(); if (gc) { cx.save(); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = a * 0.55; cx.drawImage(gc, q.x - 24, y - 24, 48, 48); cx.restore(); }
    cx.save(); cx.translate(q.x, y); cx.scale(sc, sc); cx.rotate(Math.sin(k * 40) * 0.06 * (1 - k)); cx.globalAlpha = c01(a); // 만화 욕 딱지: 가시 말풍선 + 부들부들
    cx.save(); cx.rotate(q.rot + k * 0.6); cx.fillStyle = 'rgb(28,0,22)'; cx.strokeStyle = '#ff6ae0'; cx.lineWidth = 1.8;
    cx.beginPath(); for (let i = 0; i < 18; i++) { const an = i * TAU / 18, r = i % 2 ? 12 : 17.5; cx.lineTo(Math.cos(an) * r * 1.2, Math.sin(an) * r); } cx.closePath(); cx.fill(); cx.stroke();
    cx.restore();
    cx.font = `900 11px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.lineWidth = 2.5; cx.strokeStyle = 'rgb(120,0,40)'; cx.strokeText('#@!%', 0, 0.5); cx.fillStyle = '#ffe14d'; cx.fillText('#@!%', 0, 0.5);
    cx.restore();
  }
  drawSwing(q, k) { // 소주병 휘두름: 흰·초록 초승달 (몸 옆에서 위로 쓱)
    const cx = this.R.cx, sd = q.side || 1, a0 = sd > 0 ? -Math.PI * 0.95 : -Math.PI * 0.05, a1 = a0 + eOut(c01(k * 1.5)) * 1.9 * sd;
    cx.save(); cx.translate(q.x, q.y); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 1 - k; cx.lineCap = 'round';
    for (const [w, col] of [[8, 'rgba(90,220,130,0.5)'], [3.5, 'rgba(225,255,235,1)']]) { cx.strokeStyle = col; cx.lineWidth = w * (1 - k * 0.5); cx.beginPath(); if (sd > 0) cx.arc(0, 0, 26, Math.max(a0, a1 - 1.2), a1); else cx.arc(0, 0, 26, a1, Math.min(a0, a1 + 1.2)); cx.stroke(); }
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
