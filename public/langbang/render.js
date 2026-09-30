// 랑방 대전 — 캔버스 렌더러 + 연출(FX)
// 스프라이트는 화면 해상도에 맞춰 미리 구워(bake) 두고 drawImage 만 한다.
// 이미지가 아직 없거나 404 면 색 원 + 이모지 + 이름표 자리표시자로 그린다.
import { HEROES as HEROES0, SUMMONS, ENEMIES, rowYFor } from './data.js';
const HEROES = { ...HEROES0, ...SUMMONS }; // 소환 멤버(성준영)도 그린다

const FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const TAU = Math.PI * 2;
export const HERO_BOX = 82; // 영웅 그림 상자 크기(논리 px) — 실제 캐릭터는 약 85%
const FEET = 0.92; // 그림 안에서 발 위치 (위에서부터 비율)
const FEET_OFF = 0.3; // 몸 중심(y) → 발까지 거리 (상자 대비)

const PROJ_COLOR = {
  notice: '#ffd23f', warn: '#ff6b5a', bullet: '#6dffb0', flower: '#ff9fd0', bottle: '#7be38f', wink: '#ff5fcf', cane: '#e0b27a', swear: '#ff9a3c',
};
// 챕터 전용 배경에서 랑방 지붕(영웅 줄 뒤) 위치 — 그림 높이 대비
const BG_ROOF = { 2: 0.735, 3: 0.735, 4: 0.735, 5: 0.66, 6: 0.73 };
const BG_BRIGHT = { 4: 0.42, 6: 0.36 }; // 밝은 길(제주 · 눈길) — 진상이 잘 보이게 길을 어둡게
// 챕터별 분위기 (같은 배경 그림에 색만 덧씌운다)
const THEMES = {
  1: null, // 랑방 골목: 원래 그대로
  2: { top: 'rgba(255,60,170,0.24)', bottom: 'rgba(255,140,40,0.18)', glow: 'rgba(255,80,200,0.26)', mode: 'soft-light', wash: 'rgba(160,30,120,0.35)' }, // 불금 번화가: 분홍·주황 네온
  3: { top: 'rgba(40,220,120,0.26)', bottom: 'rgba(110,30,190,0.32)', glow: 'rgba(80,255,160,0.28)', mode: 'multiply', wash: 'rgba(70,40,140,0.75)' }, // 인피 아지트: 어두운 보라 + 초록 불빛
  4: { top: 'rgba(80,200,255,0.18)', bottom: 'rgba(255,200,80,0.12)', glow: 'rgba(120,220,255,0.2)', mode: 'soft-light', wash: 'rgba(20,60,120,0.35)' },
  5: { top: 'rgba(255,150,60,0.18)', bottom: 'rgba(40,20,80,0.3)', glow: 'rgba(255,140,40,0.22)', mode: 'multiply', wash: 'rgba(30,40,70,0.6)' },
  6: { top: 'rgba(200,120,255,0.2)', bottom: 'rgba(255,255,255,0.1)', glow: 'rgba(200,140,255,0.24)', mode: 'soft-light', wash: 'rgba(60,30,110,0.45)' },
  endless: { top: 'rgba(255,40,40,0.22)', bottom: 'rgba(120,0,40,0.3)', glow: 'rgba(255,60,60,0.24)', mode: 'multiply', wash: 'rgba(150,40,60,0.7)' },
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}
const imgOk = (img) => !!(img && img.complete && img.naturalWidth > 0);

// ─── 연출 풀 ──────────────────────────────────────────
class Pool {
  constructor(cap) { this.items = []; this.free = []; this.cap = cap; }
  get() {
    if (this.items.length >= this.cap) return null;
    const o = this.free.pop() || {};
    this.items.push(o);
    return o;
  }
  update(fn) {
    const a = this.items;
    let j = 0;
    for (let i = 0; i < a.length; i++) {
      const o = a[i];
      if (fn(o)) a[j++] = o; else this.free.push(o);
    }
    a.length = j;
  }
  clear() { for (const o of this.items) this.free.push(o); this.items.length = 0; }
}

export class FX {
  constructor() {
    this.parts = new Pool(900);
    this.nums = new Pool(110);
    this.texts = new Pool(40);
    this.mks = new Pool(4); // 멀티킬 큰 글자
    this.bubbles = new Pool(6);
    this.rings = new Pool(50);
    this.arcs = new Pool(16);
    this.pillars = new Pool(6);
    this.blasts = new Pool(60);
    this.banners = [];
    this.shake = 0;
    this.flashColor = '#fff';
    this.flashA = 0;
    this.slowmo = 0;
    this.zoom = 1;
    this.zx = 180;
    this.zy = 360;
    this.zoomTarget = 1;
    this.combo = 0;
    this.comboPop = 0;
    this.ropeWobble = 0;
    this.baseHitA = 0;
    this.time = 0;
  }
  reset() {
    this.blasts.clear(); this.parts.clear(); this.nums.clear(); this.texts.clear(); this.mks.clear(); this.bubbles.clear(); this.rings.clear(); this.arcs.clear(); this.pillars.clear();
    this.banners.length = 0;
    this.shake = 0; this.flashA = 0; this.slowmo = 0; this.zoom = 1; this.zoomTarget = 1; this.combo = 0; this.baseHitA = 0;
  }
  part(type, x, y, vx, vy, life, size, color, o) {
    if (this.lite && this.parts.items.length > 320) return null; // 진상이 많을 땐 입자 수 제한
    const p = this.parts.get();
    if (!p) return null;
    p.type = type; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.color = color;
    p.rot = Math.random() * TAU; p.vr = (Math.random() - 0.5) * 10; p.grav = (o && o.grav) || 0; p.drag = (o && o.drag) || 0;
    return p;
  }
  burst(x, y, n, color, speed = 120, type = 'dot', size = 3, life = 0.45, grav = 0) {
    if (this.lite) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.4 + Math.random() * 0.8);
      this.part(type, x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6), color, { grav, drag: 3 });
    }
  }
  num(x, y, v, crit, color, eff = 0) {
    const n = this.nums.get();
    if (!n) return;
    n.x = x + (Math.random() - 0.5) * 14; n.y = y; n.vy = crit ? -70 : eff > 0 ? -60 : -48; n.life = crit ? 0.9 : eff > 0 ? 0.8 : 0.6; n.max = n.life;
    n.text = crit ? v + '!' : '' + v; n.crit = crit; n.eff = eff;
    n.color = color || (crit ? '#ff7a1a' : eff > 0 ? '#ffb02e' : eff < 0 ? '#9aa0ad' : '#ffffff');
  }
  // 멀티킬: tier 0 트리플(흰) · 1 5킬(노랑) · 2 싹쓸이(주황) · 3 대학살(무지개)
  multi(x, y, text, tier) {
    const t = this.mks.get();
    if (!t) return;
    t.x = Math.max(70, Math.min(290, x)); t.y = Math.max(150, Math.min(y, 520)); t.text = text; t.tier = tier; t.life = 1 + tier * 0.15; t.max = t.life;
    // 글자는 한 번만 그려 두고(구워 두기) 매 프레임엔 그림만 — 느린 폰에서도 가볍게
    const key = text + tier;
    this._mkc = this._mkc || {};
    if (!this._mkc[key]) {
      const k = 2, c = document.createElement('canvas'), x2 = c.getContext('2d');
      x2.font = `900 italic 22px ${FONT}`;
      const w = Math.ceil(x2.measureText(text).width + 24);
      c.width = w * k; c.height = 40 * k;
      x2.scale(k, k); x2.font = `900 italic 22px ${FONT}`; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.lineJoin = 'round';
      x2.lineWidth = 7; x2.strokeStyle = 'rgba(25,5,20,0.95)'; x2.strokeText(text, w / 2, 20);
      if (tier >= 3) { const gr = x2.createLinearGradient(0, 0, w, 0); for (let i = 0; i <= 5; i++) gr.addColorStop(i / 5, `hsl(${i * 60},100%,62%)`); x2.fillStyle = gr; } else x2.fillStyle = ['#ffffff', '#ffe14a', '#ff8a1f'][tier];
      x2.fillText(text, w / 2, 20);
      this._mkc[key] = { c, w };
    }
    t.img = this._mkc[key];
  }
  text(x, y, text, color = '#fff', size = 16, life = 1.1, vy = -36) {
    const t = this.texts.get();
    if (!t) return;
    t.x = x; t.y = y; t.text = text; t.color = color; t.size = size; t.life = life; t.max = life; t.vy = vy;
  }
  bubble(x, y, text) {
    const b = this.bubbles.get();
    if (!b) return;
    b.x = Math.max(50, Math.min(310, x)); b.y = y; b.text = text; b.life = 1.6; b.max = 1.6; b.w = 0;
  }
  ring(x, y, r0, r1, life, color, width = 3) {
    const r = this.rings.get();
    if (!r) return;
    r.x = x; r.y = y; r.r0 = r0; r.r1 = r1; r.life = life; r.max = life; r.color = color; r.width = width;
  }
  // 폭발: 실제 피해 반경 r 에 딱 맞춘 그림 (kind: heart · fire · electric · gold)
  blast(x, y, r, kind = 'gold', life = 0.42) {
    const o = this.blasts.get();
    if (!o) return;
    o.x = x; o.y = y; o.r = r; o.kind = kind; o.life = life; o.max = life;
  }
  pillar(x, w, bottom, life) {
    const o = this.pillars.get();
    if (!o) return;
    o.x = x; o.w = w; o.bottom = bottom; o.life = life; o.max = life;
  }
  arc(x, y, a, half, r, life, color) {
    const o = this.arcs.get();
    if (!o) return;
    o.x = x; o.y = y; o.a = a; o.half = half; o.r = r; o.life = life; o.max = life; o.color = color;
  }
  banner(text, sub, color, life = 1.8, kind = 'wave', sprite = null) {
    if (this.noBanner) return; // 메뉴 뒤 데모 판에서는 배너 생략
    // 같은 종류가 이미 대기 중이면 교체
    if (this.banners.length > 2) this.banners.splice(1, 1);
    this.banners.push({ text, sub, color, life, max: life, kind, sprite, t: 0 });
  }
  flash(color, a) { this.flashColor = color; this.flashA = Math.max(this.flashA, a); }
  addShake(v) { this.shake = Math.min(18, Math.max(this.shake, v)); }
  update(dt) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flashA = Math.max(0, this.flashA - dt * 2.2);
    this.baseHitA = Math.max(0, this.baseHitA - dt * 2);
    this.ropeWobble = Math.max(0, this.ropeWobble - dt * 3);
    this.comboPop = Math.max(0, this.comboPop - dt * 4);
    if (this.slowmo > 0) this.slowmo -= dt;
    const zt = this.slowmo > 0 ? this.zoomTarget : 1;
    this.zoom += (zt - this.zoom) * Math.min(1, dt * 6);
    this.parts.update((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      return true;
    });
    this.nums.update((n) => { n.life -= dt; n.y += n.vy * dt; n.vy *= Math.exp(-3 * dt); return n.life > 0; });
    this.texts.update((t) => { t.life -= dt; t.y += t.vy * dt; t.vy *= Math.exp(-2.2 * dt); return t.life > 0; });
    this.mks.update((t) => { t.life -= dt; t.y -= 22 * dt; return t.life > 0; });
    this.bubbles.update((b) => { b.life -= dt; b.y -= 12 * dt; return b.life > 0; });
    this.rings.update((r) => { r.life -= dt; return r.life > 0; });
    this.arcs.update((r) => { r.life -= dt; return r.life > 0; });
    this.pillars.update((r) => { r.life -= dt; return r.life > 0; });
    this.blasts.update((r) => { r.life -= dt; return r.life > 0; });
    const b = this.banners[0];
    // 배너가 밀려 있으면 앞의 것을 빨리 넘긴다
    if (b) { b.t += dt * (this.banners.length > 1 ? 2.2 : 1); if (b.t >= b.life) this.banners.shift(); }
  }
}

// ─── 렌더러 ───────────────────────────────────────────
export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.cx = canvas.getContext('2d', { alpha: false });
    this.W = 360;
    this.H = 720;
    this.k = 1;
    this.fx = new FX();
    this.images = {};
    this.sprites = {};
    this.projSprites = {};
    this.misc = {};
    this.bg = null;
    this.sorted = [];
    this.opts = {};
    this.loadImages();
  }

  loadImages() {
    const list = {};
    for (const id in HEROES) {
      list['h_' + id] = HEROES[id].img;
      if (HEROES[id].imgRage) list['h_' + id + '_rage'] = HEROES[id].imgRage;
      if (HEROES[id].imgOn) list['h_' + id + '_rage'] = HEROES[id].imgOn; // 문동한: 일어난 모습 (분노 그림 자리에)
      if (HEROES[id].imgAlt) list['h_' + id + '_alt'] = HEROES[id].imgAlt; // 배현경 날씬 · 고아라 늙음
    }
    this.formDefs = {};
    for (const id in ENEMIES) {
      list['e_' + id] = ENEMIES[id].img;
      const forms = ENEMIES[id].forms || {};
      for (const f in forms) {
        const key = 'e_' + id + '_' + f;
        list[key] = forms[f].img;
        this.formDefs[key] = Object.assign({}, ENEMIES[id], forms[f], { id: id + '_' + f, size: forms[f].size || ENEMIES[id].size });
      }
    }
    list.moto = '/img/lb/p_motorcycle.webp';
    list.ingyuBike = '/img/lb/h_ingyu_bike.webp'; // 백인규 할리 돌진
    list.gf = '/img/lb/p_girlfriend.webp';
    for (let i = 0; i < 4; i++) list['bar' + i] = `/img/lb/ui/barricade_${i}.webp`;
    for (const k of ['heart', 'fire', 'electric', 'gold', 'shock', 'spark']) list['fx_' + k] = `/img/lb/fx/${k === 'shock' ? 'shock_ring' : k === 'spark' ? 'hit_spark' : 'explo_' + k}.webp`;
    list.bg = '/img/lb/bg.webp';
    list.bg2 = '/img/lb/bg2.webp';
    list.bg3 = '/img/lb/bg3.webp';
    list.bg4 = '/img/lb/bg4.webp';
    list.bg5 = '/img/lb/bg5.webp';
    list.bg6 = '/img/lb/bg6.webp';
    list.base = '/img/lb/base.webp';
    const skip = new URLSearchParams(location.search).has('noimg');
    for (const key in list) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (key === 'moto' || key === 'gf' || key === 'ingyuBike') return;
        if (key.startsWith('bar')) { this.bakeBar(key); return; }
        if (key.startsWith('fx_')) return;
        if (key === 'bg' || key === 'base' || /^bg\d$/.test(key)) this.bakeBg();
        else this.bakeSprite(key);
      };
      if (!skip && list[key]) img.src = list[key]; // 아직 없는 그림은 요청 안 함 (자리표시자)
      this.images[key] = img;
    }
  }

  setTheme(t) {
    const key = t || 1;
    if (this.themeKey === key) return;
    this.themeKey = key;
    this.bakeBg();
  }

  resize(cssW, cssH, H) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2, this.maxDpr || 2); // 느린 폰이면 해상도를 조금 낮춘다 (game.js 가 조절)
    this.H = H;
    this.k = (cssW / this.W) * dpr;
    this.dpr = dpr;
    this.cv.width = Math.round(cssW * dpr);
    this.cv.height = Math.round(cssH * dpr);
    this.cv.style.width = cssW + 'px';
    this.cv.style.height = cssH + 'px';
    this.bakeAll();
  }

  bakeAll() {
    for (const id in HEROES) {
      this.bakeSprite('h_' + id);
      if (HEROES[id].imgRage || HEROES[id].imgOn) this.bakeSprite('h_' + id + '_rage');
      if (HEROES[id].imgAlt) this.bakeSprite('h_' + id + '_alt');
    }
    for (const id in ENEMIES) this.bakeSprite('e_' + id);
    for (const key in this.formDefs) this.bakeSprite(key);
    this.bakeProj();
    this.bakeBg();
  }

  // 캐릭터 스프라이트 굽기: 일반 + 흰색 번쩍 버전
  bakeSprite(key) {
    const isHero = key[0] === 'h';
    const rage = key.endsWith('_rage');
    const id = key.slice(2).replace('_rage', '').replace(/_alt$/, '');
    const def = isHero ? HEROES[id] : ENEMIES[id] || (this.formDefs && this.formDefs[key]);
    if (!def) return;
    if (def.dot) { this.bakeDot(key, def); return; }
    const box = isHero ? HERO_BOX : def.size;
    const px = Math.ceil(box * this.k * 1.1);
    const c = mkCanvas(px, px);
    const x = c.getContext('2d');
    const img = this.images[key];
    let real = false;
    if (imgOk(img)) {
      x.imageSmoothingQuality = 'high';
      if (isHero) {
        // 어두운 옷(최은옥 가죽자켓·이한나 교복)이 골목 배경에 묻히지 않게 테두리를 두른다. 히든은 분홍 빛
        const sil = mkCanvas(px, px);
        const sx = sil.getContext('2d');
        sx.imageSmoothingQuality = 'high';
        sx.drawImage(img, 0, 0, px, px);
        sx.globalCompositeOperation = 'source-in';
        sx.fillStyle = rage ? '#ffb199' : def.legend ? '#fff0a8' : def.hidden ? '#ffc4f2' : '#fff4d6';
        sx.fillRect(0, 0, px, px);
        const r = Math.max(1.5, px * (def.hidden || def.legend ? 0.02 : 0.014));
        if (def.hidden || def.legend) {
          x.save();
          x.shadowColor = rage ? 'rgba(255,70,40,0.95)' : def.legend ? 'rgba(255,200,40,1)' : 'rgba(255,90,220,0.95)';
          x.shadowBlur = px * 0.06;
          x.drawImage(sil, 0, 0);
          x.drawImage(sil, 0, 0);
          x.restore();
        }
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU;
          x.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r);
        }
      }
      x.drawImage(img, 0, 0, px, px);
      real = true;
    } else {
      this.placeholder(x, px, def, isHero, rage);
    }
    const f = mkCanvas(px, px);
    const fx = f.getContext('2d');
    fx.drawImage(c, 0, 0);
    fx.globalCompositeOperation = 'source-atop';
    fx.fillStyle = 'rgba(255,255,255,0.88)';
    fx.fillRect(0, 0, px, px);
    this.sprites[key] = { c, f, box, real };
  }

  // 헬 모드용: 붉은 기운을 미리 구운 그림 (진상마다 빛을 따로 그리지 않게)
  hellSprite(sp) {
    if (sp.h) return sp.h;
    const c = mkCanvas(sp.c.width, sp.c.height);
    const x = c.getContext('2d');
    const gl = this.projSprites.glowRed;
    x.globalAlpha = 0.7; x.drawImage(gl.c, -c.width * 0.1, c.height * 0.05, c.width * 1.2, c.height * 1.0); x.globalAlpha = 1;
    x.drawImage(sp.c, 0, 0);
    sp.h = c;
    return c;
  }
  // 단톡방 알림: 빨간 알림 점 (그림 없이 직접)
  bakeDot(key, def) {
    const box = def.size;
    const px = Math.ceil(box * this.k * 1.1);
    const c = mkCanvas(px, px);
    const x = c.getContext('2d');
    const cxp = px / 2, cyp = px * 0.55, r = px * 0.26;
    if (def.figure) {
      glow(x, cxp, cyp, r * 1.6, 'rgba(255,180,220,0.6)');
      x.font = `${Math.round(px * 0.62)}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(def.emoji, cxp, cyp);
      const f0 = mkCanvas(px, px); const fx0 = f0.getContext('2d'); fx0.drawImage(c, 0, 0); fx0.globalCompositeOperation = 'source-atop'; fx0.fillStyle = 'rgba(255,255,255,0.88)'; fx0.fillRect(0, 0, px, px);
      this.sprites[key] = { c, f: f0, box, real: true };
      return;
    }
    glow(x, cxp, cyp, r * 1.9, 'rgba(255,40,70,0.55)');
    x.fillStyle = '#ff2d45'; x.strokeStyle = '#fff'; x.lineWidth = px * 0.05;
    x.beginPath(); x.arc(cxp, cyp, r, 0, TAU); x.fill(); x.stroke();
    x.fillStyle = '#fff'; x.font = `900 ${Math.round(r * 1.2)}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('1', cxp, cyp + r * 0.05);
    const f = mkCanvas(px, px);
    const fx = f.getContext('2d');
    fx.drawImage(c, 0, 0);
    fx.globalCompositeOperation = 'source-atop'; fx.fillStyle = 'rgba(255,255,255,0.88)'; fx.fillRect(0, 0, px, px);
    this.sprites[key] = { c, f, box, real: true };
  }

  placeholder(x, px, def, isHero, rage) {
    const s = px;
    const cx = s / 2, cy = s * 0.56, r = s * 0.3;
    const color = rage ? '#ff3b30' : def.color;
    // 몸통
    const gr = x.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r * 1.1);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.25, color);
    gr.addColorStop(1, shade(color, -0.45));
    x.fillStyle = gr;
    x.beginPath();
    x.ellipse(cx, cy, r, r * 1.08, 0, 0, TAU);
    x.fill();
    x.lineWidth = s * 0.03;
    x.strokeStyle = 'rgba(20,10,30,0.85)';
    x.stroke();
    // 발
    x.fillStyle = shade(color, -0.55);
    x.beginPath();
    x.ellipse(cx - r * 0.45, s * FEET - s * 0.02, r * 0.28, r * 0.14, 0, 0, TAU);
    x.ellipse(cx + r * 0.45, s * FEET - s * 0.02, r * 0.28, r * 0.14, 0, 0, TAU);
    x.fill();
    // 얼굴 이모지
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `${Math.round(s * 0.34)}px ${FONT}`;
    x.fillText(rage ? '😡' : def.emoji, cx, cy - r * 0.08);
    // 이름표
    const label = def.name;
    x.font = `900 ${Math.round(s * 0.13)}px ${FONT}`;
    const tw = x.measureText(label).width + s * 0.1;
    const ly = s * 0.18;
    x.fillStyle = 'rgba(15,12,30,0.8)';
    roundRect(x, cx - tw / 2, ly - s * 0.08, tw, s * 0.16, s * 0.08);
    x.fill();
    x.fillStyle = isHero ? '#ffe08a' : '#ffffff';
    x.fillText(label, cx, ly + s * 0.005);
  }

  // 투사체·보석 등 작은 스프라이트
  bakeProj() {
    const k = this.k;
    const make = (name, w, h, fn) => {
      const c = mkCanvas(w * k, h * k);
      const x = c.getContext('2d');
      x.scale(k, k);
      fn(x, w, h);
      this.projSprites[name] = { c, w, h };
    };
    make('notice', 34, 24, (x, w, h) => {
      glow(x, w / 2, h / 2, 16, 'rgba(255,210,63,0.45)');
      x.fillStyle = '#ffd23f'; x.strokeStyle = '#6b4a00'; x.lineWidth = 1.6;
      roundRect(x, 3, 3, w - 6, h - 9, 6); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(9, h - 6); x.lineTo(7, h - 1); x.lineTo(14, h - 6); x.fill();
      x.fillStyle = '#3a2600'; x.font = `900 10px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('공지', w / 2, h / 2 - 2);
    });
    make('noticeBig', 58, 34, (x, w, h) => {
      glow(x, w / 2, h / 2, 28, 'rgba(255,160,40,0.55)');
      x.fillStyle = '#ff9f1c'; x.strokeStyle = '#5a2a00'; x.lineWidth = 2;
      roundRect(x, 3, 3, w - 6, h - 10, 8); x.fill(); x.stroke();
      x.fillStyle = '#fff'; x.font = `900 12px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('전체공지', w / 2, h / 2 - 3);
    });
    make('warn', 20, 26, (x, w, h) => {
      glow(x, w / 2, h / 2, 13, 'rgba(255,80,60,0.4)');
      x.fillStyle = '#ff4d3d'; x.strokeStyle = '#fff'; x.lineWidth = 1.6;
      roundRect(x, 3, 2, w - 6, h - 4, 2.5); x.fill(); x.stroke();
      x.fillStyle = '#fff'; x.font = `900 8px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('경고', w / 2, h / 2);
    });
    make('bullet', 26, 10, (x, w, h) => {
      const gr = x.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(109,255,176,0)'); gr.addColorStop(0.6, 'rgba(109,255,176,0.8)'); gr.addColorStop(1, '#ffffff');
      x.fillStyle = gr; roundRect(x, 0, 2, w, h - 4, 3); x.fill();
      x.fillStyle = '#fff'; x.beginPath(); x.arc(w - 4, h / 2, 3, 0, TAU); x.fill();
    });
    make('flower', 24, 24, (x, w, h) => {
      glow(x, w / 2, h / 2, 12, 'rgba(255,160,210,0.45)');
      x.fillStyle = '#ff9fd0';
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; x.beginPath(); x.arc(w / 2 + Math.cos(a) * 5, h / 2 + Math.sin(a) * 5, 4.4, 0, TAU); x.fill(); }
      x.fillStyle = '#ffe066'; x.beginPath(); x.arc(w / 2, h / 2, 3.4, 0, TAU); x.fill();
    });
    make('bottle', 14, 32, (x, w, h) => {
      x.fillStyle = '#3fbf6a'; x.strokeStyle = '#0d3b1e'; x.lineWidth = 1.2;
      roundRect(x, 2, 11, w - 4, h - 13, 3); x.fill(); x.stroke();
      x.fillRect(5, 3, 4, 9); x.strokeRect(5, 3, 4, 9);
      x.fillStyle = '#fff'; x.fillRect(3, 17, w - 6, 6);
      x.fillStyle = '#0d3b1e'; x.font = `900 5px ${FONT}`; x.textAlign = 'center'; x.fillText('소주', w / 2, 22);
    });
    make('bottleRage', 22, 40, (x, w, h) => {
      glow(x, w / 2, h / 2, 18, 'rgba(255,60,40,0.6)');
      x.translate(4, 4);
      x.fillStyle = '#3fbf6a'; x.strokeStyle = '#ff3b30'; x.lineWidth = 1.6;
      roundRect(x, 2, 11, 10, 19, 3); x.fill(); x.stroke();
      x.fillRect(5, 3, 4, 9);
    });
    make('wink', 26, 24, (x, w, h) => {
      glow(x, w / 2, h / 2, 13, 'rgba(255,95,207,0.55)');
      heart(x, w / 2, h / 2 + 1, 9, '#ff4fbf', '#fff');
    });
    make('cane', 40, 40, (x, w, h) => {
      x.translate(w / 2, h / 2);
      x.lineCap = 'round';
      x.strokeStyle = '#3b2210'; x.lineWidth = 6.5;
      x.beginPath(); x.moveTo(-14, 14); x.lineTo(8, -8); x.arc(12, -4, 5.5, Math.PI * 1.25, Math.PI * 0.2, false); x.stroke();
      x.strokeStyle = '#c98f4f'; x.lineWidth = 4;
      x.beginPath(); x.moveTo(-14, 14); x.lineTo(8, -8); x.arc(12, -4, 5.5, Math.PI * 1.25, Math.PI * 0.2, false); x.stroke();
    });
    // 새 멤버 투사체: 잔소리 말풍선 · 홀덤 칩 · 카드 · 시계침 · 장미 · 소주병(거꾸로)
    const textBubble = (name, txt, fill, ink, w0) => make(name, w0, 24, (x, w, h) => {
      glow(x, w / 2, h / 2, 14, 'rgba(255,160,200,0.4)');
      x.fillStyle = fill; x.strokeStyle = ink; x.lineWidth = 1.6;
      roundRect(x, 3, 3, w - 6, h - 9, 8); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(10, h - 6); x.lineTo(7, h - 1); x.lineTo(15, h - 6); x.fill();
      x.fillStyle = ink; x.font = `900 10px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, w / 2, h / 2 - 2);
    });
    textBubble('nag', '잔소리!', '#fff0f6', '#c2185b', 44);
    make('chip', 16, 16, (x, w, h) => {
      x.fillStyle = '#e53935'; x.beginPath(); x.arc(8, 8, 7, 0, TAU); x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 2; x.setLineDash([3, 2.5]); x.beginPath(); x.arc(8, 8, 5.5, 0, TAU); x.stroke(); x.setLineDash([]);
      x.fillStyle = '#fff'; x.beginPath(); x.arc(8, 8, 2.5, 0, TAU); x.fill();
    });
    make('card', 14, 19, (x, w, h) => {
      x.fillStyle = '#fff'; x.strokeStyle = '#333'; x.lineWidth = 1; roundRect(x, 1, 1, w - 2, h - 2, 2); x.fill(); x.stroke();
      x.fillStyle = '#d81b60'; x.font = `900 9px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('A♥', w / 2, h / 2 + 1);
    });
    make('tick', 22, 22, (x, w, h) => {
      glow(x, w / 2, h / 2, 11, 'rgba(180,140,255,0.6)');
      x.fillStyle = '#efe6ff'; x.strokeStyle = '#5a2ea6'; x.lineWidth = 1.6; x.beginPath(); x.arc(11, 11, 7.5, 0, TAU); x.fill(); x.stroke();
      x.strokeStyle = '#5a2ea6'; x.lineWidth = 1.8; x.beginPath(); x.moveTo(11, 11); x.lineTo(11, 6); x.moveTo(11, 11); x.lineTo(14.5, 12.5); x.stroke();
    });
    make('rose', 20, 20, (x, w, h) => {
      glow(x, w / 2, h / 2, 10, 'rgba(255,200,90,0.55)');
      x.fillStyle = '#ff4f7a'; x.beginPath(); x.arc(10, 8, 5, 0, TAU); x.fill();
      x.strokeStyle = '#2e7d32'; x.lineWidth = 2; x.beginPath(); x.moveTo(10, 12); x.lineTo(10, 19); x.stroke();
    });
    make('tap', 12, 26, (x, w, h) => {
      x.fillStyle = '#3fbf6a'; x.strokeStyle = '#0d3b1e'; x.lineWidth = 1.2;
      roundRect(x, 1, 1, w - 2, h - 12, 3); x.fill(); x.stroke();
      x.fillRect(4, h - 12, 4, 10); x.strokeRect(4, h - 12, 4, 10);
    });
    make('swear', 40, 26, (x, w, h) => {
      glow(x, w / 2, h / 2, 16, 'rgba(255,140,40,0.45)');
      x.fillStyle = '#fff3e0'; x.strokeStyle = '#7a2e00'; x.lineWidth = 1.6;
      roundRect(x, 3, 3, w - 6, h - 9, 8); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(w - 12, h - 6); x.lineTo(w - 8, h - 1); x.lineTo(w - 17, h - 6); x.fill();
      x.fillStyle = '#e0301e'; x.font = `900 11px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('#@!%', w / 2, h / 2 - 2);
    });
    make('swearBig', 62, 38, (x, w, h) => {
      glow(x, w / 2, h / 2, 28, 'rgba(255,80,20,0.6)');
      x.fillStyle = '#ff6a1c'; x.strokeStyle = '#5a1400'; x.lineWidth = 2;
      roundRect(x, 3, 3, w - 6, h - 11, 10); x.fill(); x.stroke();
      x.fillStyle = '#fff'; x.font = `900 15px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('#@!%&!', w / 2, h / 2 - 3);
    });
    make('rumor', 40, 26, (x, w, h) => {
      glow(x, w / 2, h / 2, 16, 'rgba(170,140,255,0.45)');
      x.fillStyle = '#efe8ff'; x.strokeStyle = '#3a2470'; x.lineWidth = 1.5;
      roundRect(x, 3, 3, w - 6, h - 9, 9); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(10, h - 6); x.lineTo(7, h - 1); x.lineTo(15, h - 6); x.fill();
      x.fillStyle = '#5a3ab0'; x.font = `900 10px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('수군수군', w / 2, h / 2 - 2);
    });
    make('paper', 30, 34, (x, w, h) => {
      glow(x, w / 2, h / 2, 15, 'rgba(255,230,140,0.4)');
      x.fillStyle = '#fffaf0'; x.strokeStyle = '#6b5420'; x.lineWidth = 1.2;
      x.fillRect(4, 3, w - 8, h - 6); x.strokeRect(4, 3, w - 8, h - 6);
      x.fillStyle = '#3a2a10'; x.font = `900 7px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('차용증', w / 2, 10);
      x.fillStyle = 'rgba(58,42,16,0.5)'; for (let i = 0; i < 3; i++) x.fillRect(8, 16 + i * 4, w - 16, 1.5);
      x.fillStyle = '#e0301e'; x.beginPath(); x.arc(w - 10, h - 9, 4, 0, TAU); x.fill();
    });
    make('duck', 30, 22, (x, w, h) => {
      glow(x, w / 2, h / 2, 14, 'rgba(255,170,60,0.45)');
      x.fillStyle = '#f2ead8'; x.strokeStyle = '#6b4a2a'; x.lineWidth = 1.2; // 뼈
      x.beginPath(); x.arc(5, h / 2 - 3, 3, 0, TAU); x.arc(5, h / 2 + 3, 3, 0, TAU); x.fill(); x.stroke();
      x.fillRect(5, h / 2 - 2, 8, 4);
      x.fillStyle = '#b8642a'; x.strokeStyle = '#4a2208'; x.lineWidth = 1.4; // 고기
      x.beginPath(); x.ellipse(w / 2 + 4, h / 2, 10, 8, 0, 0, TAU); x.fill(); x.stroke();
      x.fillStyle = 'rgba(255,220,160,0.7)'; x.beginPath(); x.ellipse(w / 2 + 1, h / 2 - 3, 4, 2, -0.4, 0, TAU); x.fill();
    });
    make('dumbbell', 34, 18, (x, w, h) => {
      x.fillStyle = '#2b2b33'; x.strokeStyle = '#9aa0b8'; x.lineWidth = 1.2;
      roundRect(x, 1, 1, 9, h - 2, 3); x.fill(); x.stroke();
      roundRect(x, w - 10, 1, 9, h - 2, 3); x.fill(); x.stroke();
      x.fillStyle = '#c8ccd8'; x.fillRect(9, h / 2 - 2, w - 18, 4);
    });
    make('snack', 18, 18, (x, w, h) => {
      x.fillStyle = '#f2c14e'; x.strokeStyle = '#8a5a10'; x.lineWidth = 1.2;
      x.beginPath(); x.ellipse(w / 2, h / 2, 7, 5, 0.4, 0, TAU); x.fill(); x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(w / 2 - 3, h / 2 - 2, 3, 2);
    });
    make('gfFb', 32, 32, (x, w, h) => {
      glow(x, w / 2, h / 2, 16, 'rgba(255,120,190,0.6)');
      x.fillStyle = '#ffb3d6'; x.strokeStyle = '#8a2a5a'; x.lineWidth = 1.5;
      x.beginPath(); x.arc(w / 2, h / 2, 11, 0, TAU); x.fill(); x.stroke();
      x.fillStyle = '#5a2a1a'; x.beginPath(); x.arc(w / 2, h / 2 - 3, 8, Math.PI, 0); x.fill();
      heart(x, w / 2 + 7, h / 2 - 8, 4, '#ff4f9a', null);
    });
    make('jab', 20, 16, (x, w, h) => {
      glow(x, w / 2, h / 2, 10, 'rgba(255,120,90,0.6)');
      x.fillStyle = '#ff5a4f'; x.strokeStyle = '#fff'; x.lineWidth = 1.4;
      roundRect(x, 3, 3, w - 6, h - 6, 5); x.fill(); x.stroke();
    });
    make('hammer', 34, 34, (x, w, h) => {
      glow(x, w / 2, h / 2, 17, 'rgba(255,170,230,0.55)');
      x.fillStyle = '#ffd1ec'; x.strokeStyle = '#b0407a'; x.lineWidth = 1.6;
      x.fillRect(w / 2 - 2, h / 2 - 2, 4, 15); x.strokeRect(w / 2 - 2, h / 2 - 2, 4, 15);
      roundRect(x, 5, 5, w - 10, 13, 5); x.fill(); x.stroke();
      star(x, w / 2, 11.5, 4, 2, '#ffe14d');
    });
    make('note', 18, 22, (x, w, h) => {
      glow(x, w / 2, h / 2, 10, 'rgba(255,255,255,0.45)');
      x.font = `900 18px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 3; x.strokeStyle = '#1a0b1f'; x.strokeText('♪', w / 2, h / 2 + 1);
      x.fillStyle = '#fff'; x.fillText('♪', w / 2, h / 2 + 1);
    });
    for (const [k, em] of [['sarcasm', '🪃'], ['golf', '⚪'], ['bag', '👜'], ['stamp', '📛'], ['glow', '🌟']]) {
      make('ep_' + k, 26, 26, (x, w, h) => {
        glow(x, w / 2, h / 2, 13, 'rgba(255,255,255,0.35)');
        x.font = `20px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(em, w / 2, h / 2 + 1);
      });
    }
    make('crownIco', 22, 16, (x, w, h) => {
      x.fillStyle = '#ffd23f'; x.strokeStyle = '#7a5200'; x.lineWidth = 1.2;
      x.beginPath(); x.moveTo(2, h - 2); x.lineTo(3, 4); x.lineTo(7, 9); x.lineTo(11, 2); x.lineTo(15, 9); x.lineTo(19, 4); x.lineTo(20, h - 2); x.closePath(); x.fill(); x.stroke();
    });
    make('motoFb', 40, 56, (x, w, h) => {
      glow(x, w / 2, h - 8, 16, 'rgba(255,140,40,0.7)');
      x.fillStyle = '#d82a2a'; roundRect(x, 10, 10, w - 20, h - 22, 8); x.fill();
      x.fillStyle = '#222'; x.beginPath(); x.arc(w / 2, 10, 7, 0, TAU); x.arc(w / 2, h - 12, 7, 0, TAU); x.fill();
    });
    make('heartBomb', 26, 26, (x, w, h) => {
      glow(x, w / 2, h / 2, 13, 'rgba(255,120,200,0.55)');
      heart(x, w / 2, h / 2 + 1, 9.5, '#ff4f9a', '#fff');
      x.fillStyle = '#fff'; x.fillRect(w / 2 - 1, 1, 2, 5);
    });
    make('bulletBig', 34, 14, (x, w, h) => {
      const gr = x.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(255,220,80,0)'); gr.addColorStop(0.6, 'rgba(255,220,80,0.9)'); gr.addColorStop(1, '#ffffff');
      x.fillStyle = gr; roundRect(x, 0, 3, w, h - 6, 4); x.fill();
      x.fillStyle = '#fff'; x.beginPath(); x.arc(w - 5, h / 2, 4.5, 0, TAU); x.fill();
    });
    make('gem', 14, 16, (x, w, h) => {
      glow(x, w / 2, h / 2, 8, 'rgba(90,230,255,0.5)');
      x.fillStyle = '#6ff0ff'; x.strokeStyle = '#0a5a74'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(w / 2, 1); x.lineTo(w - 2, h / 2 - 1); x.lineTo(w / 2, h - 1); x.lineTo(2, h / 2 - 1); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.moveTo(w / 2, 3); x.lineTo(w / 2 + 3, h / 2 - 1); x.lineTo(w / 2, h / 2 - 1); x.fill();
    });
    make('gemBig', 20, 22, (x, w, h) => {
      glow(x, w / 2, h / 2, 11, 'rgba(200,120,255,0.6)');
      x.fillStyle = '#c77dff'; x.strokeStyle = '#3c0a74'; x.lineWidth = 1.2;
      x.beginPath(); x.moveTo(w / 2, 1); x.lineTo(w - 2, h / 2 - 1); x.lineTo(w / 2, h - 1); x.lineTo(2, h / 2 - 1); x.closePath(); x.fill(); x.stroke();
    });
    make('heart', 16, 16, (x, w, h) => heart(x, w / 2, h / 2 + 1, 6.5, '#ff5fb8', null));
    make('star', 16, 16, (x, w, h) => star(x, w / 2, h / 2, 7, 3, '#ffe14d'));
    make('coin', 14, 14, (x, w, h) => {
      x.fillStyle = '#ffcc33'; x.strokeStyle = '#8a5a00'; x.lineWidth = 1.2;
      x.beginPath(); x.arc(w / 2, h / 2, 5.5, 0, TAU); x.fill(); x.stroke();
      x.fillStyle = '#8a5a00'; x.font = `900 6px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('₩', w / 2, h / 2 + 0.5);
    });
    make('glowRed', 120, 120, (x, w, h) => glow(x, w / 2, h / 2, 60, 'rgba(255,40,30,0.55)'));
    make('glowGold', 120, 120, (x, w, h) => glow(x, w / 2, h / 2, 60, 'rgba(255,200,60,0.5)'));
    make('glowPink', 120, 120, (x, w, h) => glow(x, w / 2, h / 2, 60, 'rgba(255,90,200,0.5)'));
    make('glowCyan', 120, 120, (x, w, h) => glow(x, w / 2, h / 2, 60, 'rgba(90,220,255,0.45)'));
    make('shadow', 60, 20, (x, w, h) => {
      const g = x.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.save(); x.scale(1, h / w); x.beginPath(); x.arc(w / 2, w / 2, w / 2, 0, TAU); x.restore(); x.fill();
    });
  }

  // 배경 굽기 (이미지 있으면 이미지, 없으면 직접 그린 골목 + 랑방 입구)
  bakeBg() {
    const W = this.W, H = this.H, k = this.k;
    if (!k) return;
    const c = mkCanvas(W * k, H * k);
    const x = c.getContext('2d');
    x.scale(k, k);
    const ch = typeof this.themeKey === 'number' && this.themeKey >= 2 && this.themeKey <= 6 ? this.themeKey : 0;
    const own = ch && imgOk(this.images['bg' + ch]); // 챕터 전용 배경이 있으면 그걸로 (색은 살짝만)
    const img = own ? this.images['bg' + ch] : this.images.bg;
    const rowY = rowYFor(H);
    if (imgOk(img)) {
      const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
      let dy = rowY + 10 - (own ? BG_ROOF[ch] : 0.7) * dh; // 배경의 랑방 건물 지붕이 영웅 줄 바로 뒤에 오도록
      dy = Math.min(0, Math.max(H - dh, dy));
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, (W - dw) / 2, dy, dw, dh);
      if (own && BG_BRIGHT[ch]) {
        // 밝은 길 어둡게 (가운데 길 + 가장자리)
        const road = x.createLinearGradient(0, 0, W, 0);
        road.addColorStop(0, 'rgba(8,10,28,0.25)'); road.addColorStop(0.3, `rgba(8,10,28,${BG_BRIGHT[ch]})`); road.addColorStop(0.7, `rgba(8,10,28,${BG_BRIGHT[ch]})`); road.addColorStop(1, 'rgba(8,10,28,0.25)');
        x.fillStyle = road; x.fillRect(0, 0, W, rowY - 30);
      }
    } else {
      this.proceduralBg(x, W, H, rowY);
    }
    // 위쪽 어둡게 (HUD 가독성) + 가장자리 비네트
    let g = x.createLinearGradient(0, 0, 0, 130);
    g.addColorStop(0, 'rgba(8,6,20,0.75)'); g.addColorStop(1, 'rgba(8,6,20,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, 130);
    g = x.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.5, H * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // 챕터 분위기 색 덧씌우기
    const th0 = THEMES[this.themeKey || 1];
    const th = own && th0 ? Object.assign({}, th0, { wash: 'rgba(0,0,0,0)', top: 'rgba(0,0,0,0)', bottom: 'rgba(0,0,0,0)' }) : th0;
    if (th) {
      x.save();
      x.globalCompositeOperation = th.mode;
      x.fillStyle = th.wash; x.fillRect(0, 0, W, H);
      x.restore();
      g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, th.top); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, th.bottom);
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      for (const [gx, gy] of [[40, H * 0.2], [W - 40, H * 0.36], [60, H * 0.5]]) glow(x, gx, gy, 90, th.glow);
    }
    // 입구 앞 따뜻한 빛
    g = x.createRadialGradient(W / 2, rowY + 30, 10, W / 2, rowY + 30, 200);
    g.addColorStop(0, 'rgba(255,170,80,0.18)'); g.addColorStop(1, 'rgba(255,170,80,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // 헬 모드: 붉은 테두리를 배경에 구워 둔다 (매 프레임 화면 전체를 칠하지 않게)
    if (this.hellOn) {
      g = x.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.5, H * 0.8);
      g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, 'rgba(140,0,10,0.5)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    this.bg = c;
  }

  proceduralBg(x, W, H, rowY) {
    // 아스팔트 골목
    let g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#141a33'); g.addColorStop(0.7, '#262b45'); g.addColorStop(1, '#2d2238');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // 인도
    x.fillStyle = '#343a55'; x.fillRect(0, 0, 44, H); x.fillRect(W - 44, 0, 44, H);
    x.fillStyle = '#1b1f35'; x.fillRect(0, 0, 18, H); x.fillRect(W - 18, 0, 18, H);
    // 차선
    x.fillStyle = 'rgba(255,230,150,0.25)';
    for (let y = 10; y < rowY - 40; y += 46) x.fillRect(W / 2 - 2, y, 4, 24);
    // 네온 간판
    const neon = [['#ff4fd8', '노래방', 24, 90], ['#4fd8ff', 'BAR', W - 30, 170], ['#ffe14d', '포차', 24, 280], ['#7dff7a', 'PC', W - 30, 360]];
    x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const [col, t, nx, ny] of neon) {
      glow(x, nx, ny, 30, hexA(col, 0.35));
      x.fillStyle = '#0e0e1a'; roundRect(x, nx - 14, ny - 28, 28, 56, 4); x.fill();
      x.strokeStyle = col; x.lineWidth = 2; x.stroke();
      x.fillStyle = col; x.font = `900 10px ${FONT}`;
      for (let i = 0; i < t.length; i++) x.fillText(t[i], nx, ny - 16 + i * 14);
    }
    // 랑방 건물
    const top = rowY + 22;
    g = x.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, '#5a3522'); g.addColorStop(1, '#2b1810');
    x.fillStyle = g; x.fillRect(20, top, W - 40, H - top);
    x.fillStyle = '#3b2215'; x.fillRect(12, top - 8, W - 24, 12);
    const base = this.images.base;
    if (imgOk(base)) {
      const s = 190;
      x.drawImage(base, W / 2 - s / 2, top - 8, s, s);
    } else {
      x.fillStyle = '#ffb35c'; roundRect(x, W / 2 - 34, top + 40, 68, H - top - 40, 30); x.fill();
      x.fillStyle = '#6b3b1f'; roundRect(x, W / 2 - 28, top + 46, 56, H - top - 46, 26); x.fill();
    }
    glow(x, W / 2, top + 22, 70, 'rgba(255,90,200,0.35)');
    x.font = `900 26px ${FONT}`; x.fillStyle = '#ffd6f5'; x.strokeStyle = '#ff4fd8'; x.lineWidth = 3;
    x.strokeText('랑방', W / 2, top + 24); x.fillText('랑방', W / 2, top + 24);
  }

  // ─── 매 프레임 그리기 ──────────────────────────────
  draw(g, ui) {
    const cx = this.cx, k = this.k, fx = this.fx, W = this.W, H = this.H;
    const t = fx.time;
    // 카메라: 흔들림 + (보스 처치 때) 확대
    const z = fx.zoom;
    const shx = fx.shake ? (Math.random() - 0.5) * fx.shake : 0;
    const shy = fx.shake ? (Math.random() - 0.5) * fx.shake : 0;
    const K = k * z;
    const OX = k * (fx.zx - fx.zx * z + shx), OY = k * (fx.zy - fx.zy * z + shy);
    this.K = K; this.OX = OX; this.OY = OY;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.fillStyle = '#0b0a16';
    cx.fillRect(0, 0, this.cv.width, this.cv.height);
    cx.setTransform(K, 0, 0, K, OX, OY);
    if (this.bg) cx.drawImage(this.bg, 0, 0, W, H);
    if (!g) { this.drawScreenFx(null); return; }

    this.drawRopeShadow(g);
    this.drawMapFxUnder(g, t);
    this.drawGems(g, t);
    this.drawEnemies(g, t);
    this.drawRope(g, t);
    this.drawPools(g, t);
    this.drawHeroes(g, t, ui);
    this.drawBeams(g, t);
    this.drawProjs(g);
    this.drawArcs();
    this.drawBlasts();
    this.drawParts();
    this.drawRings();
    this.drawTexts();
    this.drawBubbles();
    this.drawUiWorld(g, t, ui);
    this.drawScreenFx(g, ui);
  }

  // 불바다 (최은옥 분노 소주병) · 토 웅덩이
  drawPools(g, t) {
    const cx = this.cx;
    // 강성구 블랙홀: 빙글빙글 도는 보라 소용돌이 + 안으로 빨려 드는 점
    for (const q of g.holes || []) {
      this.tf(q.x, q.y, 0, 1, 0.55);
      cx.globalAlpha = 0.35; cx.fillStyle = '#2a0a4a'; cx.beginPath(); cx.arc(0, 0, q.r, 0, TAU); cx.fill();
      cx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const rr = q.r * (0.3 + i * 0.22), a0 = t * (5 - i) + i;
        cx.globalAlpha = 0.75 - i * 0.12; cx.strokeStyle = i % 2 ? '#c9a8ff' : '#7a3cff';
        cx.beginPath(); cx.arc(0, 0, rr, a0, a0 + Math.PI * 1.2); cx.stroke();
      }
      cx.globalAlpha = 0.9; cx.fillStyle = '#e8d8ff';
      for (let i = 0; i < 8; i++) { const k = ((t * 1.6 + i / 8) % 1), a = i * 0.8 + t * 3; cx.beginPath(); cx.arc(Math.cos(a) * q.r * (1 - k), Math.sin(a) * q.r * (1 - k), 2.5, 0, TAU); cx.fill(); }
      cx.globalAlpha = 1;
    }
    for (const q of g.puddles || []) {
      const a = Math.min(1, q.t / 0.5);
      this.tf(q.x, q.y, 0, 1, 0.35);
      cx.globalAlpha = 0.55 * a;
      cx.fillStyle = q.enemy ? '#b8d64a' : '#9acd32';
      cx.beginPath(); cx.arc(0, 0, q.r, 0, TAU); cx.fill();
      cx.globalAlpha = 0.6 * a; cx.fillStyle = '#e8ff9a';
      for (let i = 0; i < 4; i++) { cx.beginPath(); cx.arc(Math.cos(i * 1.7 + q.x) * q.r * 0.5, Math.sin(i * 2.3) * q.r * 0.5, 4 + (i % 2) * 3, 0, TAU); cx.fill(); }
      cx.globalAlpha = 1;
    }
    // 찌질남: 달라붙은 멤버와 하트 끈
    for (const e of g.enemies) {
      if (e.dead || !e.clingTo) continue;
      const h = e.clingTo;
      this.world();
      cx.strokeStyle = 'rgba(160,170,200,0.8)'; cx.lineWidth = 2; cx.setLineDash([5, 4]);
      cx.beginPath(); cx.moveTo(e.x, e.y - 20); cx.quadraticCurveTo((e.x + h.x) / 2, (e.y + h.y) / 2 - 40, h.x, h.y - 30); cx.stroke();
      cx.setLineDash([]);
    }
    // 손진상 팔
    for (const e of g.enemies) {
      if (e.dead || !e.grabbing) continue;
      const h = e.grabbing;
      this.world();
      cx.lineCap = 'round';
      for (const [dx, w, col] of [[-8, 7, '#7a4a22'], [8, 7, '#7a4a22'], [-8, 4, '#f0c08a'], [8, 4, '#f0c08a']]) {
        cx.strokeStyle = col; cx.lineWidth = w;
        const wob = Math.sin(t * 10 + dx) * 6;
        cx.beginPath(); cx.moveTo(e.x + dx, e.y - 20); cx.quadraticCurveTo((e.x + h.x) / 2 + wob, (e.y + h.y) / 2 - 30, h.x + dx * 0.6, h.y - 30); cx.stroke();
      }
    }
    if (!g.pools || !g.pools.length) return;
    const gl = this.projSprites.glowRed;
    for (const q of g.pools) {
      const a = Math.min(1, q.t / 0.4);
      this.tf(q.x, q.y + 8, 0, 1, 0.45);
      cx.globalAlpha = 0.75 * a;
      const r = q.r * (1 + Math.sin(t * 12 + q.x) * 0.05);
      cx.drawImage(gl.c, -r * 1.2, -r * 1.2, r * 2.4, r * 2.4);
      cx.globalAlpha = 1;
    }
  }

  // 이한나 하트 레이저
  drawBeams(g, t) {
    const cx = this.cx;
    for (const h of g.heroes) {
      if (h.def.proj !== 'beam') continue;
      for (const [e, w] of [[h.beamE, 1], [h.beam2E, 0.6]]) {
        if (!e || e.dead) continue;
        const x0 = h.rx !== undefined ? h.rx : h.x, y0 = h.y - 40, x1 = e.x, y1 = e.y - e.def.size * 0.3;
        const ramp = Math.min(1, h.beamT / 2.5);
        this.world();
        cx.lineCap = 'round';
        cx.globalAlpha = 0.35;
        cx.strokeStyle = '#ff5fcf'; cx.lineWidth = (7 + ramp * 7) * w + Math.sin(t * 30) * 1.5;
        cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke();
        cx.globalAlpha = 0.95;
        cx.strokeStyle = '#ffe0f6'; cx.lineWidth = (2 + ramp * 2.5) * w;
        cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke();
        cx.globalAlpha = 1;
        const hs = this.projSprites.heart;
        const k = (t * 1.6 + h.slot * 0.3) % 1;
        this.tf(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 0, 0.9 + ramp * 0.4, 0.9 + ramp * 0.4);
        cx.drawImage(hs.c, -8, -8, 16, 16);
      }
    }
  }

  // 부채꼴 음파 (방장) · 스킬 원 · 문동한 빔
  drawArcs() {
    const cx = this.cx;
    this.world();
    for (const b of this.fx.pillars.items) {
      const p = b.life / b.max;
      const w = b.w * (0.6 + p * 0.6);
      const gr = cx.createLinearGradient(b.x - w, 0, b.x + w, 0);
      gr.addColorStop(0, 'rgba(120,255,200,0)'); gr.addColorStop(0.5, `rgba(220,255,240,${0.9 * p})`); gr.addColorStop(1, 'rgba(120,255,200,0)');
      cx.fillStyle = gr;
      cx.fillRect(b.x - w, -20, w * 2, b.bottom + 20);
    }
    for (const a of this.fx.arcs.items) {
      const p = 1 - a.life / a.max;
      cx.globalAlpha = (1 - p) * 0.55;
      cx.fillStyle = a.color;
      cx.beginPath();
      cx.moveTo(a.x, a.y);
      cx.arc(a.x, a.y, a.r * (0.35 + p * 0.65), a.a - a.half, a.a + a.half);
      cx.closePath();
      cx.fill();
      cx.globalAlpha = (1 - p) * 0.9;
      cx.strokeStyle = '#fff6c8'; cx.lineWidth = 2.5;
      cx.beginPath(); cx.arc(a.x, a.y, a.r * (0.35 + p * 0.65), a.a - a.half, a.a + a.half); cx.stroke();
    }
    cx.globalAlpha = 1;
  }

  // 맵 효과 (바닥 쪽): 미끄러운 바닥 · 공사 중 · 노래방 · 회식
  drawMapFxUnder(g, t) {
    const fx = g.mapFx;
    if (!fx || fx.id === 'none') return;
    const cx = this.cx, W = this.W;
    this.world();
    if (fx.id === 'icy') {
      cx.globalAlpha = 0.18 + Math.sin(t * 2) * 0.04;
      cx.fillStyle = '#bff4ff';
      for (let i = 0; i < 5; i++) { cx.beginPath(); cx.ellipse(60 + i * 60, g.ropeY - 60 - (i % 2) * 120, 50, 12, -0.2, 0, TAU); cx.fill(); }
      cx.globalAlpha = 1;
    } else if (fx.id === 'construction') {
      const [l, r] = fx.lane;
      for (const [x0, x1] of [[0, l - 8], [r + 8, W]]) {
        cx.fillStyle = 'rgba(20,14,6,0.55)'; cx.fillRect(x0, 60, x1 - x0, g.ropeY - 70);
        for (let y = 80; y < g.ropeY - 20; y += 70) {
          const mx = (x0 + x1) / 2;
          cx.fillStyle = '#ff8a1c'; cx.beginPath(); cx.moveTo(mx, y); cx.lineTo(mx - 11, y + 26); cx.lineTo(mx + 11, y + 26); cx.closePath(); cx.fill();
          cx.fillStyle = '#fff'; cx.fillRect(mx - 7, y + 12, 14, 4);
        }
      }
    } else if (fx.id === 'karaoke') {
      cx.strokeStyle = '#ff6fd8'; cx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const p = ((t * 0.6 + i / 3) % 1);
        cx.globalAlpha = (1 - p) * 0.35;
        for (const x0 of [-10, W + 10]) { cx.beginPath(); cx.arc(x0, g.H * 0.35, 30 + p * 140, 0, TAU); cx.stroke(); }
      }
      cx.globalAlpha = 1;
    } else if (fx.id === 'conveyor') {
      const [l, r] = fx.belt;
      cx.fillStyle = 'rgba(30,34,48,0.45)'; cx.fillRect(l, 40, r - l, g.ropeY - 40);
      cx.strokeStyle = 'rgba(255,210,63,0.35)'; cx.lineWidth = 3;
      for (let y = 40 + ((t * 60) % 40); y < g.ropeY; y += 40) { cx.beginPath(); cx.moveTo(l + 6, y); cx.lineTo((l + r) / 2, y + 12); cx.lineTo(r - 6, y); cx.stroke(); }
    } else if (fx.id === 'campfire') {
      const gl = this.projSprites.glowRed;
      const fy = g.ropeY - 90, fr = fx.fire.r;
      cx.globalAlpha = 0.55 + Math.sin(t * 9) * 0.12;
      cx.drawImage(gl.c, fx.fire.x - fr * 1.6, fy - fr * 1.6, fr * 3.2, fr * 3.2);
      cx.globalAlpha = 1;
      cx.font = `28px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('🔥', fx.fire.x, fy + Math.sin(t * 12) * 1.5);
      if (Math.random() < 0.3) this.fx.part('spark', fx.fire.x + (Math.random() - 0.5) * 30, fy, (Math.random() - 0.5) * 40, -90, 0.6, 2.5, '#ffb347');
    } else if (fx.id === 'feast') {
      const gl = this.projSprites.glowRed;
      cx.globalAlpha = 0.25 + Math.sin(t * 3) * 0.08;
      cx.drawImage(gl.c, W / 2 - 220, g.rowY - 150, 440, 300);
      cx.globalAlpha = 1;
    }
  }

  drawMapFxOver(g) {
    const cx = this.cx, W = this.W, H = this.H, t = this.fx.time, id = g.mapFx.id;
    if (g.hell) {
      // 헬 모드: 붉은 테두리 (미리 만든 그라데이션)
      if (!this.hellOn) { this.hellOn = true; this.bakeBg(); }
    } else if (this.hellOn) { this.hellOn = false; this.bakeBg(); }
    if (id === 'rain') {
      cx.strokeStyle = 'rgba(170,200,255,0.35)'; cx.lineWidth = 1.2;
      cx.beginPath();
      for (let i = 0; i < 46; i++) {
        const x = (i * 83.7 + t * 60) % (W + 40) - 20;
        const y = (i * 137.3 + t * 620) % (H + 40) - 20;
        cx.moveTo(x, y); cx.lineTo(x - 5, y + 16);
      }
      cx.stroke();
    } else if (id === 'fog') {
      if (!this.fogGrad || this.fogH !== H) {
        const gr = cx.createLinearGradient(0, 0, 0, H * 0.55);
        gr.addColorStop(0, 'rgba(210,215,235,0.55)'); gr.addColorStop(0.6, 'rgba(210,215,235,0.28)'); gr.addColorStop(1, 'rgba(210,215,235,0)');
        this.fogGrad = gr; this.fogH = H;
      }
      cx.fillStyle = this.fogGrad; cx.fillRect(0, 0, W, H * 0.55);
      cx.globalAlpha = 0.18;
      const gl = this.projSprites.glowCyan;
      for (let i = 0; i < 4; i++) { const x = ((i * 120 + t * 12) % (W + 200)) - 100; cx.drawImage(gl.c, x - 90, H * 0.15 + i * 40, 180, 110); }
      cx.globalAlpha = 1;
    } else if (id === 'blackout' && g.darkT > 0) {
      const f = Math.min(1, g.darkT / 0.3, (g.mapFx.dark - g.darkT) / 0.2 + 0.4);
      const flick = Math.random() < 0.04 ? 0.5 : 1;
      const gr = cx.createLinearGradient(0, 0, 0, H);
      const edge = (g.rowY - (g.mapFx.seeR || 190)) / H;
      gr.addColorStop(0, `rgba(2,2,8,${0.93 * f * flick})`); gr.addColorStop(Math.max(0, edge - 0.05), `rgba(2,2,8,${0.9 * f * flick})`);
      gr.addColorStop(Math.min(1, edge + 0.08), 'rgba(2,2,8,0.15)'); gr.addColorStop(1, 'rgba(2,2,8,0.1)');
      cx.fillStyle = gr; cx.fillRect(0, 0, W, H);
    } else if (id === 'snow') {
      cx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 40; i++) {
        const x = (i * 83.7 + Math.sin(t * 0.8 + i) * 18) % W;
        const y = (i * 131.3 + t * 40) % H;
        cx.beginPath(); cx.arc(x, y, 1.2 + (i % 3) * 0.7, 0, TAU); cx.fill();
      }
    } else if (id === 'lightshow') {
      const c = ['rgba(255,79,216,0.18)', 'rgba(111,240,255,0.16)', 'rgba(255,210,63,0.16)'];
      for (let i = 0; i < 3; i++) {
        const a = Math.sin(t * (0.7 + i * 0.3) + i * 2) * 0.6;
        cx.save(); cx.translate(W * (0.2 + i * 0.3), 0); cx.rotate(a);
        cx.fillStyle = c[i]; cx.beginPath(); cx.moveTo(-8, 0); cx.lineTo(8, 0); cx.lineTo(70, H * 0.75); cx.lineTo(-70, H * 0.75); cx.closePath(); cx.fill(); cx.restore();
      }
      if (g.strobeT > 0 && Math.sin(t * 40) > 0) { cx.fillStyle = 'rgba(255,255,255,0.22)'; cx.fillRect(0, 0, W, H); }
    } else if (id === 'wind') {
      cx.strokeStyle = 'rgba(220,240,255,0.35)'; cx.lineWidth = 1.5;
      const dir = g.windX >= 0 ? 1 : -1;
      cx.beginPath();
      for (let i = 0; i < 18; i++) {
        const y = (i * 53.3) % (g.ropeY);
        const x = ((i * 97.1 + t * 160 * dir) % (W + 60) + W + 60) % (W + 60) - 30;
        cx.moveTo(x, y); cx.lineTo(x + 26 * dir, y + 2);
      }
      cx.stroke();
    } else if (id === 'megaphone' && g.megaT > 0) {
      cx.globalAlpha = 0.25 + Math.sin(t * 20) * 0.1;
      cx.strokeStyle = '#ff3b5c'; cx.lineWidth = 8;
      cx.strokeRect(4, 4, W - 8, H - 8);
      cx.globalAlpha = 1;
    } else if (id === 'happy') {
      const c = ['#ffd23f', '#ff4fd8', '#6ff0ff', '#7dff9a'];
      for (let i = 0; i < 14; i++) {
        const x = (i * 71.3 + Math.sin(t + i) * 20) % W;
        const y = (i * 97.1 + t * 50) % (H * 0.7);
        cx.fillStyle = c[i % 4]; cx.save(); cx.translate(x, y); cx.rotate(t * 3 + i); cx.fillRect(-3, -1.5, 6, 3); cx.restore();
      }
    }
  }

  // 조준 · 사거리 · 드래그 (화면 위 조작 표시)
  drawUiWorld(g, t, ui) {
    if (!ui) return;
    const cx = this.cx;
    this.world();
    if (ui.infoHero && g.heroes.includes(ui.infoHero)) {
      const h = ui.infoHero;
      cx.setLineDash([6, 6]);
      cx.strokeStyle = 'rgba(255,240,180,0.7)'; cx.lineWidth = 2;
      cx.beginPath(); cx.arc(h.x, h.y - 30, ui.infoRange || h.def.range, Math.PI, TAU); cx.stroke();
      cx.setLineDash([]);
      cx.globalAlpha = 0.07; cx.fillStyle = '#fff3b0';
      cx.beginPath(); cx.arc(h.x, h.y - 30, ui.infoRange || h.def.range, Math.PI, TAU); cx.fill();
      cx.globalAlpha = 1;
    }
    if (ui.aim) {
      const a = ui.aim;
      if (a.x !== undefined) {
        const r = a.r;
        const ok = a.y > 24 && a.y < g.ropeY + 6;
        // 쓸 수 있는 곳: 방어선 위 필드 (점선 테두리)
        cx.setLineDash([4, 6]); cx.strokeStyle = 'rgba(255,255,255,0.35)'; cx.lineWidth = 1.5;
        cx.strokeRect(4, 24, this.W - 8, g.ropeY - 18);
        cx.setLineDash([]);
        let n = 0;
        for (const e of g.enemies) if (!e.dead) { const dx = e.x - a.x, dy = e.y - a.y; if (dx * dx + dy * dy <= (r + e.r) * (r + e.r)) n++; }
        a.color0 = a.color0 || a.color;
        cx.strokeStyle = ok ? a.color0 || '#ff6b5a' : '#888'; cx.lineWidth = 3;
        cx.setLineDash([10, 6]); cx.lineDashOffset = -t * 30;
        cx.beginPath(); cx.arc(a.x, a.y, r, 0, TAU); cx.stroke();
        cx.setLineDash([]);
        cx.globalAlpha = 0.14; cx.fillStyle = a.color || '#ff6b5a';
        cx.beginPath(); cx.arc(a.x, a.y, r, 0, TAU); cx.fill();
        cx.globalAlpha = 1;
        cx.beginPath(); cx.moveTo(a.x - 12, a.y); cx.lineTo(a.x + 12, a.y); cx.moveTo(a.x, a.y - 12); cx.lineTo(a.x, a.y + 12); cx.stroke();
        cx.font = `900 13px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        const lbl = ok ? `진상 ${n}명` : '여기선 못 써요';
        cx.lineWidth = 4; cx.strokeStyle = '#1a0b1f'; cx.strokeText(lbl, a.x, a.y - r - 12);
        cx.fillStyle = ok ? '#fff' : '#ff8a8a'; cx.fillText(lbl, a.x, a.y - r - 12);
      }
    }
    if (ui.drag) {
      const d = ui.drag;
      if (d.h.def.lane && d.slotX !== undefined) {
        // 줄 공격 멤버: 놓을 자리의 줄을 보여 준다
        const w = d.h.def.lane;
        const gr = cx.createLinearGradient(0, 0, 0, g.rowY);
        gr.addColorStop(0, 'rgba(111,240,255,0)'); gr.addColorStop(1, 'rgba(111,240,255,0.28)');
        cx.fillStyle = gr; cx.fillRect(d.slotX - w, 0, w * 2, g.rowY);
      }
      const slot = d.slot;
      if (slot !== undefined) {
        cx.strokeStyle = '#6ff0ff'; cx.lineWidth = 3;
        cx.beginPath(); cx.ellipse(d.slotX, g.rowY + 26, 30, 9, 0, 0, TAU); cx.stroke();
      }
      const sp = this.sprites['h_' + d.h.id];
      if (sp) {
        this.tf(d.x, d.y + 20, Math.sin(t * 10) * 0.08, 1.08, 1.08);
        cx.globalAlpha = 0.85;
        cx.drawImage(sp.c, -HERO_BOX / 2, -HERO_BOX * FEET, HERO_BOX, HERO_BOX);
        cx.globalAlpha = 1;
      }
    }
  }

  tf(x, y, rot, sx, sy) {
    const K = this.K;
    if (rot) {
      const c = Math.cos(rot), s = Math.sin(rot);
      this.cx.setTransform(K * sx * c, K * sx * s, -K * sy * s, K * sy * c, this.OX + K * x, this.OY + K * y);
    } else this.cx.setTransform(K * sx, 0, 0, K * sy, this.OX + K * x, this.OY + K * y);
  }
  world() { this.cx.setTransform(this.K, 0, 0, this.K, this.OX, this.OY); }

  drawRopeShadow(g) {
    // 로프 앞 바닥 선 (입구 경계)
    const cx = this.cx, y = g.ropeY + 10;
    cx.globalAlpha = 0.5 + this.fx.baseHitA * 0.5;
    const gr = cx.createLinearGradient(0, y - 14, 0, y + 20);
    gr.addColorStop(0, 'rgba(255,60,90,0)'); gr.addColorStop(0.5, `rgba(255,60,90,${0.18 + this.fx.baseHitA * 0.4})`); gr.addColorStop(1, 'rgba(255,60,90,0)');
    cx.fillStyle = gr;
    cx.fillRect(0, y - 14, this.W, 34);
    cx.globalAlpha = 1;
  }

  drawGems(g, t) {
    const cx = this.cx;
    const a = this.projSprites.gem, b = this.projSprites.gemBig;
    for (const m of g.gems) {
      const s = m.big ? b : a;
      const bob = m.fly ? 0 : Math.sin(t * 5 + m.x) * 2;
      this.tf(m.x, m.y + bob, 0, 1, 1);
      cx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
    }
  }

  // 글자 하나를 미리 구워 둔다 (진상마다 매 프레임 글자를 그리면 느림)
  glyph(txt, size, color) {
    const key = txt + size + color;
    this._gly = this._gly || {};
    let o = this._gly[key];
    if (!o) {
      const k = 2, w = size * 2 + 8, h = size + 8, c = document.createElement('canvas');
      c.width = w * k; c.height = h * k;
      const x = c.getContext('2d'); x.scale(k, k);
      x.font = `900 ${size}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
      x.lineWidth = 3; x.strokeStyle = 'rgba(15,5,25,0.9)'; x.fillStyle = color;
      x.strokeText(txt, w / 2, h / 2); x.fillText(txt, w / 2, h / 2);
      o = this._gly[key] = { c, w, h };
    }
    return o;
  }
  drawEnemies(g, t) {
    const cx = this.cx;
    const list = this.sorted;
    list.length = 0;
    const dark = g.darkT > 0 ? g.rowY - (g.mapFx.seeR || 190) : -1e9;
    for (const e of g.enemies) if (!e.dead && (e.y > dark || e === g.focus)) list.push(e);
    list.sort((a, b) => a.y - b.y);
    const sh = this.projSprites.shadow;
    const heavy = list.length > 85 || (g.hell && list.length > 50); // 많을 땐 가벼운 그리기 (작은 진상 그림자 생략 · 연기 줄임)
    // 그림자 먼저
    for (const e of list) {
      if (heavy && !e.boss && !e.mid && e.def.size < 80) continue;
      const box = e.def.size;
      const w = box * 0.62;
      this.tf(e.x, e.y + box * FEET_OFF, 0, 1, 1);
      cx.drawImage(sh.c, -w / 2, -w * 0.13, w, w * 0.26);
    }
    // 정예: 발밑에 붉은 금빛 고리 (범위 공격이 덜 먹힘)
    cx.lineWidth = 2.5;
    for (const e of list) {
      if (!e.elite) continue;
      const w = e.def.size * 0.46, p = 0.6 + Math.sin(t * 6 + e.uid) * 0.25;
      this.tf(e.x, e.y + e.def.size * FEET_OFF, 0, 1, 1);
      cx.globalAlpha = p;
      cx.strokeStyle = '#ff5a3c';
      cx.beginPath(); cx.ellipse(0, 0, w, w * 0.3, 0, 0, TAU); cx.stroke();
      cx.strokeStyle = '#ffd23f';
      cx.beginPath(); cx.ellipse(0, 0, w * 0.78, w * 0.22, 0, 0, TAU); cx.stroke();
    }
    cx.globalAlpha = 1;
    const focus = g.focus && !g.focus.dead ? g.focus : null;
    // 독재자 오라 (바닥에 붉은 원)
    for (const e of list) {
      if (!e.auraOn) continue;
      this.tf(e.x, e.y + e.def.size * FEET_OFF, 0, 1, 0.42);
      cx.globalAlpha = 0.28 + Math.sin(t * 5) * 0.08;
      cx.strokeStyle = '#ff4b3a'; cx.lineWidth = 3;
      cx.setLineDash([8, 7]);
      cx.beginPath(); cx.arc(0, 0, e.def.aura.r, 0, TAU); cx.stroke();
      cx.setLineDash([]);
      cx.globalAlpha = 1;
    }
    for (const e of list) {
      let def = e.def;
      let key = 'e_' + e.type;
      if (e.form) {
        const f = e.form === 'reveal' ? (Math.sin(t * 30) > 0 ? e.nextForm : null) : e.form;
        if (f === 'ugly' || f === 'fat') { key += '_' + f; def = this.formDefs[key] || def; }
      }
      const box = def.size;
      let sp = this.sprites[key] || this.sprites['e_' + e.type];
      // 중간 보스: 각성 = 원래 그림을 크게 · 합체 = 두 그림 나란히
      const fz = def.fuse;
      if (def.mid && def.base) sp = this.sprites['e_' + def.base] || sp;
      if (!sp) continue;
      const feet = e.y + box * FEET_OFF;
      const moving = !e.atRope && e.stunT <= 0 && e.windup <= 0;
      const w = e.age * (4 + e.speed * 0.09) + e.phase;
      let bob = 0, rot = 0, sx = 1, sy = 1;
      if (moving) {
        bob = -Math.abs(Math.sin(w)) * box * 0.07;
        rot = Math.sin(w) * (def.zigzag ? 0.2 : 0.07);
        sy = 1 - Math.abs(Math.cos(w)) * 0.05;
        sx = 1 / sy;
      } else if (e.atRope && e.hitT > 0) {
        const p = Math.sin((1 - e.hitT / 0.25) * Math.PI);
        bob = p * 7;
        sy = 1 - p * 0.1;
        sx = 1 + p * 0.1;
        rot = p * 0.12 * (e.phase > 3 ? 1 : -1);
      } else {
        sy = 1 + Math.sin(t * 3 + e.phase) * 0.02;
      }
      if (e.windup > 0) { sy = 0.82; sx = 1.14; bob = 0; rot = Math.sin(t * 60) * 0.03; }
      if (e.kbv < -30) rot -= Math.min(0.5, -e.kbv * 0.0012) * (e.phase > 3 ? 1 : -1);
      if (e.stunT > 0) rot = Math.sin(t * 9 + e.phase) * 0.15;
      if (e.fleeing) { sx = -sx; bob = -Math.abs(Math.sin(e.age * 18)) * 5; }
      // 보스 발밑 오라
      if (e.warnN > 0) {
        this.world();
        for (let i = 0; i < 3; i++) {
          cx.fillStyle = i < e.warnN ? '#ffd23f' : 'rgba(0,0,0,0.45)';
          cx.strokeStyle = '#1a0b1f'; cx.lineWidth = 1.2;
          cx.beginPath(); cx.rect(e.x - 10 + i * 7, e.y - box * 0.78 - 8, 5, 7); cx.fill(); cx.stroke();
        }
      }
      if (e.boss && e.weakT > 0) {
        const gl = this.projSprites.glowGold;
        const r = box * (0.75 + Math.sin(t * 16) * 0.08);
        this.tf(e.x, e.y - box * 0.2, 0, 1, 1);
        cx.drawImage(gl.c, -r, -r, r * 2, r * 2);
      }
      if (e.boss) {
        const gl = this.projSprites.glowRed;
        const r = box * (0.6 + Math.sin(t * 4) * 0.05);
        this.tf(e.x, feet - box * 0.1, 0, 1, 0.5);
        cx.drawImage(gl.c, -r, -r, r * 2, r * 2);
      }
      if (e.goodsOn) {
        const gl = this.projSprites.glowGold;
        const r = box * 0.55;
        this.tf(e.x, e.y - box * 0.12, 0, 1, 1);
        cx.globalAlpha = 0.7; cx.drawImage(gl.c, -r, -r, r * 2, r * 2); cx.globalAlpha = 1;
      }
      if (e.stallT > 0 && Math.random() < 0.3) this.fx.part('puff', e.x + (Math.random() - 0.5) * 20, e.y - box * 0.4, 0, -40, 0.6, 9, 'rgba(90,90,100,0.7)');
      if (e.shield > 0 || e.packN >= 2) {
        const gl = this.projSprites.glowCyan;
        const r = box * (e.shield > 0 ? 0.55 : 0.42);
        this.tf(e.x, e.y - box * 0.12, 0, 1, 1);
        cx.globalAlpha = e.shield > 0 ? 1 : Math.min(0.9, 0.3 + e.packN * 0.15);
        cx.drawImage(gl.c, -r, -r, r * 2, r * 2);
        cx.globalAlpha = 1;
      }
      if (e.dictT > 0 && !e.auraOn) {
        const gl = this.projSprites.glowRed;
        const r = box * 0.36;
        this.tf(e.x, feet - 2, 0, 1, 0.4);
        cx.globalAlpha = 0.7;
        cx.drawImage(gl.c, -r, -r, r * 2, r * 2);
        cx.globalAlpha = 1;
      }
      if (e.form === 'reveal') {
        const gl = this.projSprites.glowGold;
        const r = box * 0.6;
        this.tf(e.x, e.y - box * 0.15, 0, 1, 1);
        cx.drawImage(gl.c, -r, -r, r * 2, r * 2);
        rot = Math.sin(t * 40) * 0.08;
      }
      if (g.hell && !def.mid && !heavy && Math.random() < 0.02) this.fx.part('puff', e.x + (Math.random() - 0.5) * box * 0.4, e.y, 0, -60, 0.7, 6, 'rgba(255,50,30,0.5)'); // 헬: 가끔 붉은 연기
      if (def.mid) {
        // 각성 오라: 보라·빨강 빛 + 올라가는 기운
        const gl = this.projSprites.glowPink;
        const r = box * (0.62 + Math.sin(t * 6 + e.phase) * 0.05);
        this.tf(e.x, e.y - box * 0.15, 0, 1, 1);
        cx.globalAlpha = 0.75; cx.drawImage(gl.c, -r, -r, r * 2, r * 2); cx.globalAlpha = 1;
        if (Math.random() < 0.25) this.fx.part('puff', e.x + (Math.random() - 0.5) * box * 0.5, feet - 6, 0, -70, 0.6, 7, 'rgba(200,80,255,0.55)');
      }
      if (fz) {
        const a = this.sprites['e_' + fz[0]], b = this.sprites['e_' + fz[1]];
        const bw = box * 0.8;
        if (b) { this.tf(e.x + box * 0.2, feet + bob, rot, sx, sy); cx.drawImage(e.flash > 0 ? b.f : b.c, -bw / 2, -bw * FEET, bw, bw); }
        if (a) { this.tf(e.x - box * 0.2, feet + bob, -rot, sx, sy); cx.drawImage(e.flash > 0 ? a.f : a.c, -bw / 2, -bw * FEET, bw, bw); }
      } else {
        this.tf(e.x, feet + bob, rot, sx, sy);
        const img = e.flash > 0 ? sp.f : g.hell ? this.hellSprite(sp) : sp.c; // 헬: 붉은 빛을 미리 구운 그림 (그리기 1번)
        cx.drawImage(img, -box / 2, -box * FEET, box, box);
      }
      if (def.mid) {
        // 이름표
        this.world();
        cx.font = `900 10px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        const lbl = '⚡' + def.name;
        const tw = cx.measureText(lbl).width + 12;
        cx.fillStyle = 'rgba(60,10,80,0.9)'; roundRect(cx, e.x - tw / 2, feet + 2, tw, 14, 7); cx.fill();
        cx.strokeStyle = '#d8a8ff'; cx.lineWidth = 1; cx.stroke();
        cx.fillStyle = '#fff'; cx.fillText(lbl, e.x, feet + 9.5);
      }
      // 상태 아이콘 / 체력바는 회전 없이
      const top = feet - box * 0.86;
      const vip = e.boss || e.mid || e.elite;
      if (e.slowT > 0 && (!heavy || vip)) { // 진상이 많을 땐 표시를 줄인다
        this.tf(e.x, feet, 0, 1, 0.35);
        cx.strokeStyle = 'rgba(120,200,255,0.85)'; cx.lineWidth = 3;
        cx.beginPath(); cx.arc(0, 0, box * 0.3, 0, TAU); cx.stroke();
      }
      if ((e.stunT > 0 || e.windup > 0) && (!heavy || vip || e.windup > 0)) {
        const st = this.projSprites.star;
        for (let i = 0; i < 3; i++) {
          const a = t * 5 + i * TAU / 3;
          this.tf(e.x + Math.cos(a) * box * 0.22, top + Math.sin(a) * 4, a, 0.8, 0.8);
          cx.drawImage(st.c, -8, -8, 16, 16);
        }
      }
      if (e.fleeing) {
        const gs = this.projSprites.gem;
        this.tf(e.x, top - 4 + Math.sin(t * 12) * 2, 0, 1.1, 1.1);
        cx.drawImage(gs.c, -gs.w / 2, -gs.h / 2, gs.w, gs.h);
      }
      if (def.gao && e.gaoOn) {
        const gl = this.projSprites.glowGold;
        const r = box * 0.5 * (1 + Math.sin(t * 6) * 0.06);
        this.tf(e.x, e.y - box * 0.15, 0, 1, 1);
        cx.globalAlpha = 0.6; cx.drawImage(gl.c, -r, -r, r * 2, r * 2); cx.globalAlpha = 1;
      }
      if (def.latte && e.latteOffT <= 0 && !heavy) {
        this.tf(e.x, feet, 0, 1, 0.4);
        cx.globalAlpha = 0.18; cx.strokeStyle = '#c8b8a0'; cx.lineWidth = 3;
        cx.setLineDash([4, 8]); cx.beginPath(); cx.arc(0, 0, def.latte.r * 0.5, 0, TAU); cx.stroke(); cx.setLineDash([]);
        cx.globalAlpha = 1;
      }
      if (e.form === 'reveal' || e.packN >= 2 || (e.dictT > 0 && !e.auraOn)) {
        // 상태 글자: 약점 "!" · 뭉침 방패 · 독재자 버프
        const txt = e.form === 'reveal' ? '!' : e.packN >= 2 ? '🛡' : '▲';
        this.tf(e.x + box * 0.28, top - 2, 0, 1, 1);
        const gl = this.glyph(txt, e.form === 'reveal' ? 20 : 11, e.form === 'reveal' ? '#ffe14d' : e.packN >= 2 ? '#9feaff' : '#ff6b5a');
        cx.drawImage(gl.c, -gl.w / 2, -gl.h / 2, gl.w, gl.h);
      }
      if (!e.boss && (e.hp < e.maxHp || e.shield > 0)) {
        const bw = Math.min(40, box * 0.55), bh = 4.5;
        this.tf(e.x - bw / 2, top, 0, 1, 1);
        cx.fillStyle = 'rgba(10,8,20,0.8)';
        cx.fillRect(-1, -1, bw + 2, bh + 2);
        const f = Math.max(0, e.hp / e.maxHp);
        cx.fillStyle = f > 0.5 ? '#6ee06e' : f > 0.25 ? '#ffc93c' : '#ff4b4b';
        cx.fillRect(0, 0, bw * f, bh);
        if (e.shield > 0) {
          cx.fillStyle = '#7fe7ff';
          cx.fillRect(0, -3, bw * Math.min(1, e.shield / e.maxHp), 2.5);
        }
      }
      if (e === focus) {
        this.tf(e.x, e.y - box * 0.2, t * 2, 1, 1);
        const r = box * 0.42 + Math.sin(t * 8) * 2;
        cx.strokeStyle = '#ff3b5c'; cx.lineWidth = 2.5;
        cx.beginPath();
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; cx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6); cx.lineTo(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05); }
        cx.stroke();
        cx.beginPath(); cx.arc(0, 0, r * 0.8, 0, TAU); cx.stroke();
      }
    }
  }

  drawRope(g, t) {
    this.drawBarricade(g, t);
  }
  // 방어선 "정회원 통과": 테이블·의자 더미 + 개찰구 + 간판. 입구 내구도에 따라 금 가고 기울고 불꽃이 튄다
  // 방어선 그림: 한 번 구워 둔다 (반투명 연기의 초록빛은 회색으로 — 탁한 색 방지)
  bakeBar(key) {
    const img = this.images[key];
    if (!imgOk(img)) return;
    const c = mkCanvas(img.naturalWidth, img.naturalHeight);
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    if (key === 'bar3' || key === 'bar2') {
      try {
        const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
        for (let i = 0; i < p.length; i += 4) {
          const a = p[i + 3];
          if (a > 0 && a < 235 && p[i + 1] > p[i] && p[i + 1] > p[i + 2]) { const l = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11; p[i] = p[i + 1] = p[i + 2] = l * 0.8; }
        }
        x.putImageData(d, 0, 0);
      } catch { /* 보안 제한이면 그대로 */ }
    }
    this.misc[key] = c;
  }
  drawBarricade(g, t) {
    const bars = this.misc;
    if (bars.bar0) { this.drawBarricadeImg(g, t); return; }
    this.drawBarricadeProc(g, t);
  }
  // 그림 방어선: 입구 내구도에 따라 4단계 (부드럽게 바뀜) + 흔들림 · 간판 글자 · 불꽃
  drawBarricadeImg(g, t) {
    const cx = this.cx, W = this.W, fx = this.fx;
    const f = g.base.max ? g.base.hp / g.base.max : 1;
    const st = f < 0.15 ? 3 : f < 0.4 ? 2 : f < 0.7 ? 1 : 0;
    if (this.barSt === undefined) { this.barSt = st; this.barPrev = st; this.barFade = 1; }
    if (st !== this.barSt) { this.barPrev = this.barSt; this.barSt = st; this.barFade = 0; }
    this.barFade = Math.min(1, this.barFade + 1 / 30);
    const wob = fx.ropeWobble;
    const shake = wob > 0 ? Math.sin(t * 60) * wob * 3 : 0;
    const bw = W, bh = W * (618 / 1200);
    const y0 = g.ropeY + 12 - bh * 0.82; // 차단봉 발이 방어선에 오게
    this.world();
    const draw = (s, a) => { const c = this.misc['bar' + s] || this.misc.bar0; cx.globalAlpha = a; cx.drawImage(c, shake, y0, bw, bh); };
    if (this.barFade < 1) draw(this.barPrev, 1);
    draw(this.barSt, this.barFade);
    cx.globalAlpha = 1;
    // 간판 "정회원 통과" (네온 · 위험하면 깜빡이고 기울어짐)
    const sx = W * 0.5 + shake, sy = y0 + bh * 0.307;
    const flick = st >= 2 && Math.sin(t * (st >= 3 ? 23 : 9)) > 0.6 ? 0.35 : 1;
    cx.save();
    cx.translate(sx, sy);
    cx.rotate(st >= 3 ? 0.08 + Math.sin(t * 4) * 0.03 : st >= 2 ? Math.sin(t * 3) * 0.03 : 0);
    cx.font = `900 13px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.globalAlpha = flick;
    cx.lineJoin = 'round'; cx.lineWidth = 4; cx.strokeStyle = '#1a0b1f'; cx.strokeText('정회원 통과', 0, 0);
    cx.fillStyle = st >= 3 ? '#ff6a4a' : '#ff4fd8';
    cx.shadowColor = st >= 3 ? 'rgba(255,80,40,0.9)' : 'rgba(255,79,216,0.9)'; cx.shadowBlur = 10;
    cx.fillText('정회원 통과', 0, 0);
    cx.shadowBlur = 0;
    cx.restore();
    cx.globalAlpha = 1;
    const y = g.ropeY + 10;
    if (st >= 2 && Math.random() < (st >= 3 ? 0.5 : 0.18)) fx.part('spark', 20 + Math.random() * (W - 40), y - 14, (Math.random() - 0.5) * 120, -80 - Math.random() * 80, 0.4, 3, st >= 3 ? '#ff6a3a' : '#ffd23f', { grav: 400 });
    if (st >= 1 && wob > 0.3 && Math.random() < 0.4) fx.part('puff', 20 + Math.random() * (W - 40), y - 6, 0, -20, 0.5, 8, 'rgba(200,180,160,0.6)');
    if (fx.repairT > 0) {
      fx.repairT -= 1 / 60;
      if (Math.random() < 0.35) fx.part('star', 20 + Math.random() * (W - 40), y - 10 - Math.random() * 20, 0, -40, 0.6, 7, null);
    }
  }
  drawBarricadeProc(g, t) {
    const cx = this.cx, W = this.W, fx = this.fx;
    const f = g.base.max ? g.base.hp / g.base.max : 1;
    const st = f < 0.15 ? 3 : f < 0.4 ? 2 : f < 0.7 ? 1 : 0;
    const y = g.ropeY + 10;
    const wob = fx.ropeWobble;
    const shake = wob > 0 ? Math.sin(t * 60) * wob * 3 : 0;
    this.world();
    cx.save();
    cx.translate(shake, 0);
    // 테이블 · 의자 더미 (양쪽) + 개찰구 (가운데 줄마다)
    const tilt = [0, 0.03, 0.08, 0.15][st];
    const seg = [[4, 72], [288, 356]];
    for (const [a, b] of seg) {
      const mid = (a + b) / 2;
      cx.save();
      cx.translate(mid, y);
      cx.rotate((a < 100 ? -1 : 1) * tilt);
      // 뒤집힌 테이블
      cx.fillStyle = st >= 2 ? '#4a3020' : '#6b4428'; cx.strokeStyle = '#1e120a'; cx.lineWidth = 2;
      roundRect(cx, -(b - a) / 2, -18, b - a, 12, 3); cx.fill(); cx.stroke();
      cx.fillStyle = '#3a2416';
      for (const lx of [-(b - a) / 2 + 6, (b - a) / 2 - 10]) { cx.fillRect(lx, -30, 4, 14); cx.strokeRect(lx, -30, 4, 14); }
      // 플라스틱 의자
      cx.fillStyle = st >= 3 ? '#8a2430' : '#c8323f';
      roundRect(cx, -12, -34, 24, 14, 3); cx.fill(); cx.stroke();
      cx.fillRect(-10, -20, 3, 12); cx.fillRect(7, -20, 3, 12);
      cx.restore();
    }
    // 개찰구 (정회원 전용 게이트) — 가운데
    const gates = [96, 150, 210, 264];
    for (let i = 0; i < gates.length; i++) {
      const gx = gates[i];
      const lean = st >= 2 ? Math.sin(i * 2.1 + 1) * tilt : 0;
      cx.save();
      cx.translate(gx, y);
      cx.rotate(lean);
      cx.fillStyle = '#2a2f3e'; cx.strokeStyle = '#0c0e16'; cx.lineWidth = 2;
      roundRect(cx, -9, -26, 18, 28, 4); cx.fill(); cx.stroke();
      cx.fillStyle = st >= 3 ? '#ff3b30' : st >= 2 ? '#ffb02e' : '#4fe08a'; // 불빛 (위험하면 빨강)
      cx.beginPath(); cx.arc(0, -19, 3, 0, TAU); cx.fill();
      // 차단 막대
      cx.strokeStyle = '#e8e8f0'; cx.lineWidth = 3; cx.lineCap = 'round';
      const drop = st >= 3 ? 0.9 : st >= 2 ? 0.35 : 0;
      cx.beginPath(); cx.moveTo(8, -12); cx.lineTo(8 + Math.cos(drop) * 20, -12 + Math.sin(drop) * 20); cx.stroke();
      cx.beginPath(); cx.moveTo(-8, -12); cx.lineTo(-8 - Math.cos(drop) * 20, -12 + Math.sin(drop) * 20); cx.stroke();
      cx.restore();
    }
    // 금 (피해 단계)
    if (st >= 1) {
      cx.strokeStyle = 'rgba(20,10,5,0.85)'; cx.lineWidth = 1.3;
      const cracks = st * 4;
      for (let i = 0; i < cracks; i++) {
        const x0 = 14 + ((i * 97) % (W - 28)), y0 = y - 16 + (i % 3) * 5;
        cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x0 + 5, y0 + 4); cx.lineTo(x0 + 2, y0 + 9); cx.lineTo(x0 + 8, y0 + 12); cx.stroke();
      }
    }
    // 간판 "정회원 통과" (흔들림)
    const swing = Math.sin(t * (st >= 2 ? 4 : 1.4)) * (0.02 + st * 0.05) + wob * 0.12 * Math.sin(t * 30);
    cx.save();
    cx.translate(W / 2, y - 44);
    cx.rotate(swing + (st >= 3 ? 0.12 : 0));
    cx.strokeStyle = '#1a0b1f'; cx.lineWidth = 2;
    cx.beginPath(); cx.moveTo(-36, -14); cx.lineTo(-30, 8); cx.moveTo(36, -14); cx.lineTo(30, 8); cx.stroke();
    const sg = cx.createLinearGradient(0, -2, 0, 20);
    sg.addColorStop(0, st >= 3 ? '#ff5a4f' : '#ffd23f'); sg.addColorStop(1, st >= 3 ? '#a3121e' : '#f08a1a');
    cx.fillStyle = sg; cx.lineWidth = 3;
    roundRect(cx, -44, 0, 88, 22, 6); cx.fill(); cx.stroke();
    cx.fillStyle = '#1a0b1f';
    cx.font = `900 12px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText('정회원 통과', 0, 11.5);
    cx.restore();
    cx.restore();
    // 위험: 불꽃 · 먼지 · 빨간 경고
    if (st >= 2 && Math.random() < (st >= 3 ? 0.5 : 0.18)) fx.part('spark', 20 + Math.random() * (W - 40), y - 14, (Math.random() - 0.5) * 120, -80 - Math.random() * 80, 0.4, 3, st >= 3 ? '#ff6a3a' : '#ffd23f', { grav: 400 });
    if (st >= 1 && wob > 0.3 && Math.random() < 0.4) fx.part('puff', 20 + Math.random() * (W - 40), y - 6, 0, -20, 0.5, 8, 'rgba(200,180,160,0.6)');
    if (fx.repairT > 0) {
      // 수리 중: 초록 반짝 + 망치
      fx.repairT -= 1 / 60;
      if (Math.random() < 0.35) fx.part('star', 20 + Math.random() * (W - 40), y - 10 - Math.random() * 20, 0, -40, 0.6, 7, null);
      cx.globalAlpha = Math.min(1, fx.repairT) * 0.35;
      cx.fillStyle = '#7dff9a'; cx.fillRect(0, y - 30, W, 34);
      cx.globalAlpha = 1;
    }
  }
  drawRopeOld(g, t) {
    const cx = this.cx, W = this.W;
    const y = g.ropeY + 12;
    const wob = this.fx.ropeWobble;
    this.world();
    const posts = [8, 68, 128, 180, 232, 292, 352];
    // 벨벳 로프
    cx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      cx.strokeStyle = pass ? '#d8233f' : '#4a0612';
      cx.lineWidth = pass ? 4 : 7;
      cx.beginPath();
      for (let i = 0; i < posts.length - 1; i++) {
        const a = posts[i], b = posts[i + 1];
        const sag = 9 + Math.sin(t * 20 + i) * wob * 8;
        cx.moveTo(a, y - 12);
        cx.quadraticCurveTo((a + b) / 2, y - 12 + sag * 2, b, y - 12);
      }
      cx.stroke();
    }
    // 금색 기둥
    if (!this.postGrads) {
      // 기둥 금색 그라데이션은 한 번만 만든다
      this.postGrads = posts.map((px) => {
        const gr = cx.createLinearGradient(px - 3, 0, px + 3, 0);
        gr.addColorStop(0, '#8a6a1c'); gr.addColorStop(0.5, '#ffe38a'); gr.addColorStop(1, '#8a6a1c');
        return gr;
      });
    }
    for (let i = 0; i < posts.length; i++) {
      const px = posts[i];
      cx.fillStyle = this.postGrads[i];
      cx.fillRect(px - 2.5, y - 16, 5, 22);
      cx.beginPath(); cx.ellipse(px, y + 6, 8, 3, 0, 0, TAU); cx.fill();
      cx.beginPath(); cx.arc(px, y - 17, 4.2, 0, TAU); cx.fill();
    }
    void W;
  }

  drawHeroes(g, t, ui) {
    const cx = this.cx;
    for (const sl of []) { // (예전: 잠긴 자리 자물쇠 — 이제 자리는 모두 열려 있다)
      const x = g.slotX[sl], y = g.rowY + 6;
      this.world();
      cx.globalAlpha = 0.75;
      cx.strokeStyle = '#8a8fa8'; cx.lineWidth = 3; cx.setLineDash([6, 4]);
      cx.beginPath(); cx.moveTo(x - 24, y - 30); cx.lineTo(x + 24, y + 10); cx.moveTo(x + 24, y - 30); cx.lineTo(x - 24, y + 10); cx.stroke();
      cx.setLineDash([]);
      cx.fillStyle = '#2a2f3e'; cx.strokeStyle = '#000'; cx.lineWidth = 2;
      roundRect(cx, x - 11, y - 14, 22, 18, 4); cx.fill(); cx.stroke();
      cx.strokeStyle = '#c8ccd8'; cx.lineWidth = 3;
      cx.beginPath(); cx.arc(x, y - 14, 7, Math.PI, 0); cx.stroke();
      cx.fillStyle = '#ffd23f'; cx.beginPath(); cx.arc(x, y - 6, 2.5, 0, TAU); cx.fill();
      cx.globalAlpha = 1;
    }
    const box = g.nPos >= 7 ? HERO_BOX * 0.86 : HERO_BOX;
    const sh = this.projSprites.shadow;
    for (const h of g.heroes) {
      if (h.rx === undefined) h.rx = h.x;
      h.rx += (h.x - h.rx) * 0.25;
      const hx = h.out || h.restT > 0 ? h.px : h.rx;
      const hy = h.out || h.restT > 0 ? h.py : h.y;
      if (ui && ui.drag && ui.drag.h === h) continue; // 끌고 있는 영웅은 손가락 위치에 따로 그린다
      const feet = hy + box * FEET_OFF;
      // 발판 빛
      const gl = g.rallyT > 0 ? this.projSprites.glowGold : h.rage ? this.projSprites.glowRed : h.charmT > 0 ? this.projSprites.glowPink : this.projSprites.glowGold;
      const pr = h.rage ? 56 + Math.sin(t * 14) * 8 : 34;
      this.tf(hx, feet - 2, 0, 1, h.rage ? 0.9 : 0.35);
      cx.globalAlpha = h.rage ? 0.95 : 0.55;
      cx.drawImage(gl.c, -pr, -pr, pr * 2, pr * 2);
      cx.globalAlpha = 1;
      if (h.def.legend) {
        this.tf(hx, feet - 4, 0, 1, 0.4);
        cx.globalAlpha = 0.7 + Math.sin(t * 5) * 0.2;
        const gg = this.projSprites.glowGold, rr = 50;
        cx.drawImage(gg.c, -rr, -rr, rr * 2, rr * 2);
        cx.globalAlpha = 1;
      }
      this.tf(hx, feet, 0, 1, 1);
      cx.drawImage(sh.c, -26, -7, 52, 14);
      const up = h.rage || h.upT > 0;
      const key = h.alt && this.sprites['h_' + h.id + '_alt'] ? 'h_' + h.id + '_alt' : up && this.sprites['h_' + h.id + '_rage'] ? 'h_' + h.id + '_rage' : 'h_' + h.id;
      const sp = this.sprites[key];
      if (!sp) continue;
      let bob = Math.sin(t * 3 + h.slot) * 1.2, rot = 0, sx = 1, sy = 1;
      if (h.recoil > 0) { const p = h.recoil / 0.14; sy = 1 + p * 0.07; sx = 1 - p * 0.05; bob -= p * 3; }
      if (h.rage) { rot = Math.sin(t * 24) * 0.05; bob += Math.sin(t * 30) * 1.5; }
      if (h.charmT > 0) { rot = Math.sin(t * 4) * 0.14; }
      if (h.stunT > 0) { rot = Math.sin(t * 10) * 0.1; sy = 0.94; }
      if (h.joinT < 0.4) { const p = h.joinT / 0.4; const e = 1 + Math.sin(p * Math.PI) * 0.3; sx *= e * p; sy *= e * p; }
      if (h.id === 'sunggu' || (h.id === 'ara' && h.alt)) rot += Math.sin(t * 1.5) * 0.04; // 할아버지 · 늙은 공주 휘청
      if (h.id === 'hyungyeong' && h.alt) bob += Math.sin(t * 22) * 1.6; // 날씬 복서 스텝
      this.tf(hx, feet + bob, rot, sx, sy);
      cx.globalAlpha = h.stunT > 0 ? 0.75 : 1;
      cx.drawImage(sp.c, -box / 2, -box * FEET, box, box);
      cx.globalAlpha = 1;
      const top = feet - box * 0.9;
      // 홀림 하트
      if (h.charmT > 0) {
        const hs = this.projSprites.heart;
        for (let i = 0; i < 3; i++) {
          const a = t * 3 + i * TAU / 3;
          this.tf(hx + Math.cos(a) * 22, top + 6 + Math.sin(a) * 6, 0, 1, 1);
          cx.drawImage(hs.c, -8, -8, 16, 16);
        }
      }
      if (h.stunT > 0) {
        const st = this.projSprites.star;
        for (let i = 0; i < 3; i++) {
          const a = t * 6 + i * TAU / 3;
          this.tf(hx + Math.cos(a) * 18, top + 4 + Math.sin(a) * 4, a, 0.8, 0.8);
          cx.drawImage(st.c, -8, -8, 16, 16);
        }
      }
      // 뒷담화(수군수군) · 공포 · 유혹 표시
      if (h.rumorT > 0) {
        const rs = this.projSprites.rumor;
        this.tf(hx + 16, top - 8 + Math.sin(t * 6) * 2, 0, 0.7, 0.7);
        cx.drawImage(rs.c, -rs.w / 2, -rs.h / 2, rs.w, rs.h);
      }
      if (h.grabT > 0 || h.blindT > 0 || h.drowsyT > 0 || h.vomitT > 0) {
        this.tf(hx + 20, top + 2, 0, 1, 1);
        cx.font = `12px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.fillText(h.grabT > 0 ? '🙌' : h.blindT > 0 ? '😵' : h.drowsyT > 0 ? '💤' : '🤢', 0, Math.sin(t * 8) * 1.5);
      }
      if (h.paperT > 0) {
        const ps = this.projSprites.paper;
        this.tf(hx - 18, top - 4 + Math.sin(t * 5) * 2, 0.2, 0.6, 0.6);
        cx.drawImage(ps.c, -ps.w / 2, -ps.h / 2, ps.w, ps.h);
      }
      if (h.fearT > 0) {
        this.tf(hx - 20, top + 2, 0, 1, 1);
        cx.font = `12px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.fillText('😱', 0, Math.sin(t * 10) * 1.5);
      }
      if (g.flirt && h.def.gender === 'm') {
        const hs = this.projSprites.heart;
        this.tf(hx - 18, top + 10 + Math.sin(t * 4 + h.slot) * 3, 0, 0.8, 0.8);
        cx.globalAlpha = 0.85;
        cx.drawImage(hs.c, -8, -8, 16, 16);
        cx.globalAlpha = 1;
      }
      // 이름 + 레벨
      this.world();
      const label = h.guest ? '게스트 ' + h.def.name : h.def.name;
      cx.font = `900 10px ${FONT}`;
      cx.textAlign = 'center';
      cx.textBaseline = 'middle';
      const tw = cx.measureText(label).width + 23;
      const ly = feet + 9;
      cx.fillStyle = h.guest ? 'rgba(10,90,110,0.9)' : h.def.legend ? 'rgba(90,60,0,0.9)' : h.def.hidden ? 'rgba(80,10,70,0.85)' : 'rgba(12,10,28,0.8)';
      roundRect(cx, hx - tw / 2, ly - 7, tw, 14, 7);
      cx.fill();
      if (h.def.hidden || h.def.legend) { cx.strokeStyle = h.def.legend ? '#ffd84a' : '#ff7fe6'; cx.lineWidth = 1; cx.stroke(); }
      cx.fillStyle = '#ffe08a';
      cx.fillText(label, hx - 7, ly + 0.5);
      cx.fillStyle = h.lv >= 5 ? '#ff9f1c' : '#9ee6ff';
      cx.font = `900 9px ${FONT}`;
      cx.fillText(h.lv >= 5 ? 'MAX' : 'Lv' + h.lv, hx + tw / 2 - 12, ly + 0.5);
      // 배현경 다이어트 게이지 · 고아라 나이 게이지
      if (h.def.diet || h.def.age) {
        const f = h.def.diet ? (h.alt ? h.altT / h.def.diet.sec[h.lv - 1] : h.meter / 100)
          : h.alt ? 1 - h.ageT / h.def.age.old[h.lv - 1] : h.ageT / h.def.age.princess[h.lv - 1];
        const bw = 34;
        cx.fillStyle = 'rgba(0,0,0,0.6)'; cx.fillRect(hx - bw / 2, ly + 8, bw, 4);
        cx.fillStyle = h.def.diet ? (h.alt ? '#ff5fa2' : '#ffb347') : h.alt ? '#a8a8a8' : '#ffc4ec';
        cx.fillRect(hx - bw / 2, ly + 8, bw * clamp01(f), 4);
      }
      // 최은옥 술 게이지
      if (h.def.soberSec) {
        const max = h.rage ? h.def.rageSec[h.lv - 1] : h.def.soberSec[h.lv - 1];
        const f = h.rage ? h.rageT / max : 1 - h.rageT / max;
        const bw = 34;
        cx.fillStyle = 'rgba(0,0,0,0.6)'; cx.fillRect(hx - bw / 2, ly + 8, bw, 4);
        cx.fillStyle = h.rage ? '#ff3b30' : '#ffb347'; cx.fillRect(hx - bw / 2, ly + 8, bw * f, 4);
      }
    }
  }

  drawProjs(g) {
    const cx = this.cx, P = this.projSprites;
    for (const p of g.projs) {
      if (p.dead || !p.lob) continue;
      const k = Math.min(1, p.lt / p.T);
      this.tf(p.tx, p.ty + 6, 0, 1, 0.4);
      cx.globalAlpha = 0.25 + k * 0.35;
      cx.strokeStyle = p.type === 'heart' ? '#ff7fc8' : '#7be38f'; cx.lineWidth = 3;
      cx.beginPath(); cx.arc(0, 0, p.splash * (0.4 + k * 0.6), 0, TAU); cx.stroke();
      cx.globalAlpha = 1;
    }
    for (const p of g.projs) {
      if (p.dead) continue;
      let s;
      switch (p.type) {
        case 'notice': s = p.big ? P.noticeBig : P.notice; this.tf(p.x, p.y, 0, 1, 1); break;
        case 'bottle': s = p.rage ? P.bottleRage : P.bottle; this.tf(p.x, p.y, p.rot, 1, 1); break;
        case 'heart': s = P.heartBomb; this.tf(p.x, p.y, Math.sin(p.rot) * 0.3, 1, 1); break;
        case 'dumbbell': s = P.dumbbell; this.tf(p.x, p.y, p.rot, 1, 1); break;
        case 'snack': s = P.snack; this.tf(p.x, p.y, p.rot, 1, 1); break;
        case 'moto': {
          const bike = this.images.ingyuBike, img = this.images.moto;
          if (imgOk(bike)) { this.tf(p.x, p.y, 0, 1, 1); cx.drawImage(bike, -38, -44, 76, 76); s = null; } // 백인규가 할리를 타고 돌진
          else { this.tf(p.x, p.y, Math.atan2(p.vy, p.vx) + Math.PI / 2, 1, 1); if (imgOk(img)) { cx.drawImage(img, -26, -34, 52, 68); s = null; } else s = P.motoFb; }
          break;
        }
        case 'bullet': s = p.big ? P.bulletBig : P.bullet; this.tf(p.x, p.y, p.rot, 1, 1); break;
        case 'wink': s = P.wink; this.tf(p.x, p.y, 0, 1, 1); break;
        case 'flower': s = P.flower; this.tf(p.x, p.y, p.rot * 0.2, 1, 1); break;
        case 'swear': s = p.big ? P.swearBig : P.swear; this.tf(p.x, p.y, Math.sin(p.dist * 0.05) * 0.15, 1, 1); break;
        case 'gf': {
          // 육준서 여사친: 동그랗게 말려 데굴데굴
          // 잘 보이게: 1.6배 · 흰/분홍 테두리 빛 · 잔상 꼬리
          const img = this.images.gf;
          if (imgOk(img) && !this._gfGlow) {
            const c = document.createElement('canvas'); c.width = c.height = 80;
            const x = c.getContext('2d');
            x.shadowColor = '#ff7fc8'; x.shadowBlur = 10; x.drawImage(img, 13, 13, 54, 54);
            x.shadowColor = '#ffffff'; x.shadowBlur = 4; x.drawImage(img, 13, 13, 54, 54);
            this._gfGlow = c;
          }
          const tr = p._tr || (p._tr = []);
          tr.push(p.x, p.y); if (tr.length > 10) tr.splice(0, 2);
          if (this._gfGlow) {
            for (let k = 0; k < tr.length - 2; k += 2) { this.tf(tr[k], tr[k + 1], p.rot, 0.7 + k * 0.03, 0.7 + k * 0.03); cx.globalAlpha = 0.12 + k * 0.03; cx.drawImage(this._gfGlow, -40, -40, 80, 80); }
            cx.globalAlpha = 1;
            this.tf(p.x, p.y, p.rot, 1, 1);
            cx.drawImage(this._gfGlow, -40, -40, 80, 80); s = null;
          } else { this.tf(p.x, p.y, p.rot, 1.6, 1.6); s = P.gfFb; }
          break;
        }
        case 'crown': {
          // 이호찬 황금 파동: 줄을 가득 채우는 금빛 띠
          this.world();
          const w = p.r, y = p.y;
          const gr = cx.createLinearGradient(0, y - 26, 0, y + 30);
          gr.addColorStop(0, 'rgba(255,240,150,0)'); gr.addColorStop(0.35, 'rgba(255,215,70,0.85)'); gr.addColorStop(0.6, 'rgba(255,170,20,0.55)'); gr.addColorStop(1, 'rgba(255,170,20,0)');
          cx.fillStyle = gr;
          cx.beginPath(); cx.ellipse(p.x, y, w, 24, 0, Math.PI, 0); cx.lineTo(p.x + w, y + 28); cx.lineTo(p.x - w, y + 28); cx.closePath(); cx.fill();
          cx.strokeStyle = 'rgba(255,250,200,0.9)'; cx.lineWidth = 2.5;
          cx.beginPath(); cx.ellipse(p.x, y, w, 22, 0, Math.PI * 1.05, -Math.PI * 0.05); cx.stroke();
          s = P.crownIco; this.tf(p.x, y - 6, 0, 1, 1);
          break;
        }
        default: s = P[p.type]; this.tf(p.x, p.y, p.rot, 1, 1);
      }
      if (s) cx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
    }
    for (const q of g.eprojs || []) {
      const s = q.kind === 'duck' ? P.duck : q.kind === 'paper' ? P.paper : P['ep_' + q.kind] || P.rumor;
      this.tf(q.x, q.y, q.kind === 'rumor' ? Math.sin(q.t * 14) * 0.12 : q.t * 12, 1, 1);
      cx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
    }
  }

  drawParts() {
    const cx = this.cx, P = this.projSprites;
    for (const p of this.fx.parts.items) {
      const a = p.life / p.max;
      switch (p.type) {
        case 'dot':
          this.tf(p.x, p.y, 0, 1, 1);
          cx.globalAlpha = a; cx.fillStyle = p.color;
          cx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          break;
        case 'spark': {
          const ang = Math.atan2(p.vy, p.vx);
          this.tf(p.x, p.y, ang, 1, 1);
          cx.globalAlpha = a; cx.fillStyle = p.color;
          cx.fillRect(-p.size * 2.5, -p.size / 3, p.size * 3, p.size * 0.66);
          break;
        }
        case 'shard':
        case 'confetti':
          this.tf(p.x, p.y, p.rot, 1, 1);
          cx.globalAlpha = Math.min(1, a * 2); cx.fillStyle = p.color;
          cx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          break;
        case 'puff': {
          this.tf(p.x, p.y, 0, 1, 1);
          const r = p.size * (1.6 - a * 0.6);
          cx.globalAlpha = a * 0.55; cx.fillStyle = p.color;
          cx.beginPath(); cx.arc(0, 0, r, 0, TAU); cx.fill();
          break;
        }
        case 'note': {
          // 음표 (김도훈)
          const s = P.note;
          this.tf(p.x, p.y, Math.sin(p.life * 6) * 0.3, p.size / 12, p.size / 12);
          cx.globalAlpha = Math.min(1, a * 2);
          cx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
          break;
        }
        case 'heart': case 'star': case 'coin': {
          const s = P[p.type];
          this.tf(p.x, p.y, p.type === 'star' ? p.rot : 0, p.size / 10, p.size / 10);
          cx.globalAlpha = Math.min(1, a * 2);
          cx.drawImage(s.c, -8, -8, 16, 16);
          break;
        }
        case 'flame': {
          const s = P.glowRed;
          const r = p.size * (0.5 + a * 0.6);
          this.tf(p.x, p.y, 0, 1, 1);
          cx.globalAlpha = a;
          cx.drawImage(s.c, -r, -r, r * 2, r * 2);
          break;
        }
      }
    }
    cx.globalAlpha = 1;
  }

  drawBlasts() {
    const cx = this.cx, list = this.fx.blasts.items;
    if (!list.length) return;
    this.world();
    // 그을음 (잠깐) → 빛 그림 (더하기) → 정확한 범위의 충격파 고리
    for (const b of list) {
      const p = 1 - b.life / b.max;
      if (p < 0.5) { cx.globalAlpha = 0.22 * (1 - p * 2); cx.fillStyle = '#1a0a08'; cx.beginPath(); cx.ellipse(b.x, b.y + 4, b.r * 0.9, b.r * 0.4, 0, 0, TAU); cx.fill(); }
    }
    cx.globalCompositeOperation = 'lighter';
    for (const b of list) {
      const p = 1 - b.life / b.max;
      const img = this.images['fx_' + b.kind];
      if (imgOk(img)) {
        const s = b.r * 2.3 * (0.75 + p * 0.35);
        cx.globalAlpha = Math.min(1, (1 - p) * 1.6);
        cx.drawImage(img, b.x - s / 2, b.y - s / 2, s, s);
      }
      const sh = this.images.fx_shock;
      if (imgOk(sh)) { const s = b.r * 2 * (0.4 + p * 0.65); cx.globalAlpha = (1 - p) * 0.9; cx.drawImage(sh, b.x - s / 2, b.y - s / 2, s, s); }
    }
    cx.globalCompositeOperation = 'source-over';
    for (const b of list) {
      const p = 1 - b.life / b.max, e = 1 - (1 - p) * (1 - p);
      cx.globalAlpha = (1 - p) * 0.95;
      cx.strokeStyle = b.kind === 'heart' ? '#ffb3e0' : b.kind === 'fire' ? '#ffb347' : b.kind === 'electric' ? '#9ff4ff' : '#ffe98a';
      cx.lineWidth = 4 * (1 - p) + 1;
      cx.beginPath(); cx.arc(b.x, b.y, b.r * (0.35 + 0.65 * e), 0, TAU); cx.stroke();
      if (p > 0.55) continue;
      cx.globalAlpha = 0.14 * (1 - p * 1.8); cx.fillStyle = cx.strokeStyle;
      cx.beginPath(); cx.arc(b.x, b.y, b.r, 0, TAU); cx.fill();
    }
    cx.globalAlpha = 1;
  }
  drawRings() {
    const cx = this.cx;
    this.world();
    for (const r of this.fx.rings.items) {
      const p = 1 - r.life / r.max;
      const e = 1 - (1 - p) * (1 - p);
      cx.globalAlpha = (1 - p) * 0.9;
      cx.strokeStyle = r.color;
      cx.lineWidth = r.width * (1 - p * 0.6);
      cx.beginPath();
      cx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, TAU);
      cx.stroke();
    }
    cx.globalAlpha = 1;
  }

  drawTexts() {
    const cx = this.cx;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.lineJoin = 'round';
    cx.font = `900 16px ${FONT}`;
    // 피해 숫자
    for (const n of this.fx.nums.items) {
      const age = n.max - n.life;
      let s = n.crit ? 1.2 : n.eff > 0 ? 0.95 : n.eff < 0 ? 0.52 : 0.7;
      if (n.crit && n.eff > 0) s = 1.45;
      if (age < 0.1) s *= 1 + (1 - age / 0.1) * (n.crit || n.eff > 0 ? 1 : 0.4);
      this.tf(n.x, n.y, 0, s, s);
      cx.globalAlpha = Math.min(1, n.life / (n.max * 0.35)) * (n.eff < 0 ? 0.8 : 1);
      if (!this.fx.lite || n.crit) {
        cx.lineWidth = n.crit || n.eff > 0 ? 5 : 4;
        cx.strokeStyle = n.crit ? '#5a0f00' : n.eff > 0 ? '#5a2600' : 'rgba(10,6,18,0.95)';
        cx.strokeText(n.text, 0, 0);
      }
      cx.fillStyle = n.color;
      cx.fillText(n.text, 0, 0);
    }
    // 멀티킬 큰 글자 (톡 튀어나왔다가 사라짐)
    for (const t of this.fx.mks.items) {
      const age = t.max - t.life;
      let sc = [1.35, 1.7, 2.1, 2.6][t.tier] || 1.35;
      if (age < 0.12) sc *= 0.4 + (age / 0.12) * 0.9; else if (age < 0.26) sc *= 1.3 - ((age - 0.12) / 0.14) * 0.3;
      this.tf(t.x, t.y, Math.sin(age * 20) * 0.04 * t.tier, sc, sc);
      cx.globalAlpha = Math.min(1, t.life / (t.max * 0.3));
      if (t.img) cx.drawImage(t.img.c, -t.img.w / 2, -20, t.img.w, 40);
    }
    cx.font = `900 16px ${FONT}`;
    // 연출 글자
    for (const t of this.fx.texts.items) {
      const age = t.max - t.life;
      let s = t.size / 16;
      if (age < 0.15) s *= 1 + (1 - age / 0.15) * 0.8;
      this.tf(t.x, t.y, 0, s, s);
      cx.globalAlpha = Math.min(1, t.life / (t.max * 0.3));
      cx.lineWidth = 5;
      cx.strokeStyle = 'rgba(15,5,25,0.92)';
      cx.strokeText(t.text, 0, 0);
      cx.fillStyle = t.color;
      cx.fillText(t.text, 0, 0);
    }
    cx.globalAlpha = 1;
  }

  drawBubbles() {
    const cx = this.cx;
    this.world();
    cx.font = `800 11px ${FONT}`;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    for (const b of this.fx.bubbles.items) {
      if (!b.w) b.w = cx.measureText(b.text).width + 16;
      const age = b.max - b.life;
      const s = age < 0.12 ? 0.5 + (age / 0.12) * 0.5 : 1;
      cx.globalAlpha = Math.min(1, b.life / 0.3);
      this.tf(b.x, b.y, 0, s, s);
      cx.fillStyle = '#fffdf5';
      cx.strokeStyle = '#1b1030';
      cx.lineWidth = 1.6;
      roundRect(cx, -b.w / 2, -12, b.w, 22, 10);
      cx.fill(); cx.stroke();
      cx.beginPath(); cx.moveTo(-4, 9); cx.lineTo(0, 17); cx.lineTo(5, 9); cx.closePath(); cx.fill();
      cx.fillStyle = '#1b1030';
      cx.fillText(b.text, 0, -1);
    }
    cx.globalAlpha = 1;
  }

  // 화면 고정 연출: 번쩍임, 배너, 콤보, 카운트다운
  drawScreenFx(g, ui) {
    const cx = this.cx, fx = this.fx, W = this.W, H = this.H, k = this.k;
    cx.setTransform(k, 0, 0, k, 0, 0);
    // 윗부분 HUD 밑 어둡게 (적이 HUD 글자를 가리지 않도록)
    if (g) {
      if (!this.topShade) {
        const gr = cx.createLinearGradient(0, 0, 0, 76);
        gr.addColorStop(0, 'rgba(8,6,20,0.7)'); gr.addColorStop(1, 'rgba(8,6,20,0)');
        this.topShade = gr;
      }
      cx.fillStyle = this.topShade;
      cx.fillRect(0, 0, W, 76);
    }
    if (fx.baseHitA > 0) {
      const gr = cx.createLinearGradient(0, H, 0, H * 0.55);
      gr.addColorStop(0, `rgba(255,30,50,${fx.baseHitA * 0.5})`); gr.addColorStop(1, 'rgba(255,30,50,0)');
      cx.fillStyle = gr; cx.fillRect(0, 0, W, H);
    }
    if (g && g.base.hp / g.base.max < 0.3 && !g.over) {
      const a = 0.18 + Math.sin(fx.time * 6) * 0.1;
      const gr = cx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.7);
      gr.addColorStop(0, 'rgba(255,0,30,0)'); gr.addColorStop(1, `rgba(255,0,30,${a})`);
      cx.fillStyle = gr; cx.fillRect(0, 0, W, H);
    }
    if (g && g.mapFx && g.mapFx.id !== 'none') this.drawMapFxOver(g);
    if (fx.flashA > 0) {
      cx.globalAlpha = fx.flashA;
      cx.fillStyle = fx.flashColor;
      cx.fillRect(0, 0, W, H);
      cx.globalAlpha = 1;
    }
    if (!g) return;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.lineJoin = 'round';
    // 콤보
    if (fx.combo >= 5) {
      const s = (1 + fx.comboPop * 0.35) * (1 + Math.min(0.5, fx.combo / 200));
      const col = fx.combo >= 100 ? '#ff4fd8' : fx.combo >= 50 ? '#ff7b2e' : fx.combo >= 20 ? '#ffd23f' : '#ffffff';
      cx.setTransform(k * s, 0, 0, k * s, k * (W - 50), k * 118);
      cx.font = `900 italic 26px ${FONT}`;
      cx.lineWidth = 6; cx.strokeStyle = 'rgba(20,5,30,0.9)';
      cx.strokeText(fx.combo, 0, 0);
      cx.fillStyle = col; cx.fillText(fx.combo, 0, 0);
      cx.font = `900 italic 11px ${FONT}`;
      cx.lineWidth = 4;
      const cl = fx.combo >= 10 ? `콤보 · EXP +${Math.round(Math.min(0.15, fx.combo * 0.003) * 100)}%` : '콤보';
      cx.strokeText(cl, 0, 19); cx.fillText(cl, 0, 19);
      cx.setTransform(k, 0, 0, k, 0, 0);
    }
    // 웨이브 사이 카운트다운
    if (g.phase === 'break' && !ui.paused) {
      const n = Math.ceil(g.phaseT);
      const p = g.phaseT - Math.floor(g.phaseT);
      const s = 1 + p * 0.3;
      cx.setTransform(k * s, 0, 0, k * s, k * W / 2, k * H * 0.42);
      cx.globalAlpha = 0.5 + p * 0.5;
      cx.font = `900 15px ${FONT}`;
      cx.lineWidth = 5; cx.strokeStyle = 'rgba(10,5,25,0.9)';
      const msg = g.wave === 0 ? '진상들이 몰려온다!' : '다음 웨이브';
      cx.strokeText(msg, 0, -30); cx.fillStyle = '#ffe9b0'; cx.fillText(msg, 0, -30);
      cx.font = `900 54px ${FONT}`;
      cx.lineWidth = 8;
      cx.strokeText(n, 0, 12); cx.fillStyle = '#ffd23f'; cx.fillText(n, 0, 12);
      cx.globalAlpha = 1;
      cx.setTransform(k, 0, 0, k, 0, 0);
    }
    const b = fx.banners[0];
    if (b) this.drawBanner(b);
  }

  drawBanner(b) {
    const cx = this.cx, W = this.W, H = this.H, k = this.k;
    const p = b.t / b.life;
    const inT = Math.min(1, b.t / 0.28);
    const outT = Math.max(0, (b.t - (b.life - 0.35)) / 0.35);
    const ease = 1 - Math.pow(1 - inT, 3);
    const y = H * (b.kind === 'boss' ? 0.34 : 0.3);
    const alpha = 1 - outT;
    cx.globalAlpha = alpha;
    if (b.kind === 'boss' || b.kind === 'rage' || b.kind === 'hidden' || b.kind === 'big') {
      // 가로 띠
      const bh = b.kind === 'boss' ? 118 : 74;
      const col = b.color;
      const gr = cx.createLinearGradient(0, y - bh / 2, 0, y + bh / 2);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.2, hexA(col, 0.78)); gr.addColorStop(0.8, hexA(col, 0.78)); gr.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = gr;
      cx.fillRect(-W * (1 - ease), y - bh / 2, W, bh);
      // 사선 무늬
      cx.fillStyle = 'rgba(255,255,255,0.08)';
      for (let i = -2; i < 12; i++) {
        const x0 = i * 40 + ((b.t * 120) % 40);
        cx.beginPath(); cx.moveTo(x0, y - bh / 2 + 10); cx.lineTo(x0 + 16, y - bh / 2 + 10); cx.lineTo(x0 - 4, y + bh / 2 - 10); cx.lineTo(x0 - 20, y + bh / 2 - 10); cx.fill();
      }
      if (b.sprite && this.sprites[b.sprite]) {
        const sp = this.sprites[b.sprite];
        const s = b.kind === 'boss' ? 130 : 84;
        const sx = 8 - (1 - ease) * 120;
        cx.drawImage(sp.c, sx, y - s * 0.62, s, s);
      }
    }
    const jit = b.kind === 'rage' ? (Math.random() - 0.5) * 4 : 0;
    const scale = (b.kind === 'wave' ? 0.6 + ease * 0.4 : 1) * (1 + Math.max(0, 1 - b.t / 0.18) * 0.4);
    const tx = b.sprite ? W / 2 + 44 : W / 2;
    cx.setTransform(k * scale, 0, 0, k * scale, k * (tx + jit + (1 - ease) * 60), k * (y - (b.sub ? 10 : 0)));
    cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.lineJoin = 'round';
    const size = b.kind === 'wave' ? 44 : b.kind === 'boss' ? 30 : 26;
    cx.font = `900 italic ${size}px ${FONT}`;
    cx.lineWidth = 8; cx.strokeStyle = 'rgba(15,5,25,0.95)';
    cx.strokeText(b.text, 0, 0);
    const gr = cx.createLinearGradient(0, -size / 2, 0, size / 2);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, b.kind === 'wave' ? '#ffd23f' : '#ffe9f5'); gr.addColorStop(1, b.kind === 'wave' ? '#ff8a00' : b.color);
    cx.fillStyle = gr;
    cx.fillText(b.text, 0, 0);
    if (b.sub) {
      cx.font = `800 13px ${FONT}`;
      cx.lineWidth = 5;
      cx.strokeText(b.sub, 0, size * 0.5 + 12);
      cx.fillStyle = '#fff4d6';
      cx.fillText(b.sub, 0, size * 0.5 + 12);
    }
    cx.globalAlpha = 1;
    cx.setTransform(k, 0, 0, k, 0, 0);
    void p;
  }
}

// ─── 그리기 도우미 ─────────────────────────────────────
export function roundRect(x, X, Y, w, h, r) {
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + w, Y, X + w, Y + h, r);
  x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r);
  x.arcTo(X, Y, X + w, Y, r);
  x.closePath();
}
function glow(x, cx, cy, r, color) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
}
function heart(x, cx, cy, s, fill, stroke) {
  x.beginPath();
  x.moveTo(cx, cy + s * 0.9);
  x.bezierCurveTo(cx - s * 1.6, cy - s * 0.2, cx - s * 0.7, cy - s * 1.3, cx, cy - s * 0.45);
  x.bezierCurveTo(cx + s * 0.7, cy - s * 1.3, cx + s * 1.6, cy - s * 0.2, cx, cy + s * 0.9);
  x.fillStyle = fill; x.fill();
  if (stroke) { x.strokeStyle = stroke; x.lineWidth = 1.5; x.stroke(); }
}
function star(x, cx, cy, R, r, fill) {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R;
    x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.closePath(); x.fillStyle = fill; x.fill();
  x.strokeStyle = '#7a4a00'; x.lineWidth = 1; x.stroke();
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  r = f(r); g = f(g); b = f(b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
export { PROJ_COLOR };
