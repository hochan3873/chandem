// 랑방 대전 — 캔버스 렌더러 + 연출(FX)
// 스프라이트는 화면 해상도에 맞춰 미리 구워(bake) 두고 drawImage 만 한다.
// 이미지가 아직 없거나 404 면 색 원 + 이모지 + 이름표 자리표시자로 그린다.
import { HEROES, ENEMIES } from './data.js';

const FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const TAU = Math.PI * 2;
export const HERO_BOX = 82; // 영웅 그림 상자 크기(논리 px) — 실제 캐릭터는 약 85%
const FEET = 0.92; // 그림 안에서 발 위치 (위에서부터 비율)
const FEET_OFF = 0.3; // 몸 중심(y) → 발까지 거리 (상자 대비)

const PROJ_COLOR = {
  notice: '#ffd23f', warn: '#ff6b5a', bullet: '#6dffb0', flower: '#ff9fd0', bottle: '#7be38f', wink: '#ff5fcf', cane: '#e0b27a', swear: '#ff9a3c',
};
// 챕터별 분위기 (같은 배경 그림에 색만 덧씌운다)
const THEMES = {
  1: null, // 랑방 골목: 원래 그대로
  2: { top: 'rgba(255,60,170,0.24)', bottom: 'rgba(255,140,40,0.18)', glow: 'rgba(255,80,200,0.26)', mode: 'soft-light', wash: 'rgba(160,30,120,0.35)' }, // 불금 번화가: 분홍·주황 네온
  3: { top: 'rgba(40,220,120,0.26)', bottom: 'rgba(110,30,190,0.32)', glow: 'rgba(80,255,160,0.28)', mode: 'multiply', wash: 'rgba(70,40,140,0.75)' }, // 인피 아지트: 어두운 보라 + 초록 불빛
  endless: { top: 'rgba(255,40,40,0.22)', bottom: 'rgba(120,0,40,0.3)', glow: 'rgba(255,60,60,0.24)', mode: 'multiply', wash: 'rgba(150,40,60,0.7)' },
};

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
    this.bubbles = new Pool(6);
    this.rings = new Pool(50);
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
    this.parts.clear(); this.nums.clear(); this.texts.clear(); this.bubbles.clear(); this.rings.clear();
    this.banners.length = 0;
    this.shake = 0; this.flashA = 0; this.slowmo = 0; this.zoom = 1; this.zoomTarget = 1; this.combo = 0; this.baseHitA = 0;
  }
  part(type, x, y, vx, vy, life, size, color, o) {
    const p = this.parts.get();
    if (!p) return null;
    p.type = type; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.color = color;
    p.rot = Math.random() * TAU; p.vr = (Math.random() - 0.5) * 10; p.grav = (o && o.grav) || 0; p.drag = (o && o.drag) || 0;
    return p;
  }
  burst(x, y, n, color, speed = 120, type = 'dot', size = 3, life = 0.45, grav = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.4 + Math.random() * 0.8);
      this.part(type, x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6), color, { grav, drag: 3 });
    }
  }
  num(x, y, v, crit, color) {
    const n = this.nums.get();
    if (!n) return;
    n.x = x + (Math.random() - 0.5) * 14; n.y = y; n.vy = crit ? -70 : -48; n.life = crit ? 0.9 : 0.65; n.max = n.life;
    n.text = crit ? v + '!' : '' + v; n.crit = crit; n.color = color || (crit ? '#ffd23f' : '#ffffff');
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
    this.bubbles.update((b) => { b.life -= dt; b.y -= 12 * dt; return b.life > 0; });
    this.rings.update((r) => { r.life -= dt; return r.life > 0; });
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
    list.bg = '/img/lb/bg.webp';
    list.base = '/img/lb/base.webp';
    const skip = new URLSearchParams(location.search).has('noimg');
    for (const key in list) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (key === 'bg' || key === 'base') this.bakeBg();
        else this.bakeSprite(key);
      };
      if (!skip) img.src = list[key];
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
      if (HEROES[id].imgRage) this.bakeSprite('h_' + id + '_rage');
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
    const id = key.slice(2).replace('_rage', '');
    const def = isHero ? HEROES[id] : ENEMIES[id] || (this.formDefs && this.formDefs[key]);
    if (!def) return;
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
        sx.fillStyle = rage ? '#ffb199' : def.hidden ? '#ffc4f2' : '#fff4d6';
        sx.fillRect(0, 0, px, px);
        const r = Math.max(1.5, px * (def.hidden ? 0.02 : 0.014));
        if (def.hidden) {
          x.save();
          x.shadowColor = rage ? 'rgba(255,70,40,0.95)' : 'rgba(255,90,220,0.95)';
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
    make('duck', 30, 22, (x, w, h) => {
      glow(x, w / 2, h / 2, 14, 'rgba(255,170,60,0.45)');
      x.fillStyle = '#f2ead8'; x.strokeStyle = '#6b4a2a'; x.lineWidth = 1.2; // 뼈
      x.beginPath(); x.arc(5, h / 2 - 3, 3, 0, TAU); x.arc(5, h / 2 + 3, 3, 0, TAU); x.fill(); x.stroke();
      x.fillRect(5, h / 2 - 2, 8, 4);
      x.fillStyle = '#b8642a'; x.strokeStyle = '#4a2208'; x.lineWidth = 1.4; // 고기
      x.beginPath(); x.ellipse(w / 2 + 4, h / 2, 10, 8, 0, 0, TAU); x.fill(); x.stroke();
      x.fillStyle = 'rgba(255,220,160,0.7)'; x.beginPath(); x.ellipse(w / 2 + 1, h / 2 - 3, 4, 2, -0.4, 0, TAU); x.fill();
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
    const img = this.images.bg;
    const rowY = Math.round(H * 0.715);
    if (imgOk(img)) {
      const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
      let dy = rowY + 10 - 0.7 * dh; // 배경의 랑방 건물 지붕이 영웅 줄 바로 뒤에 오도록
      dy = Math.min(0, Math.max(H - dh, dy));
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, (W - dw) / 2, dy, dw, dh);
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
    const th = THEMES[this.themeKey || 1];
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
    this.drawGems(g, t);
    this.drawEnemies(g, t);
    this.drawRope(g, t);
    this.drawHeroes(g, t);
    this.drawProjs(g);
    this.drawParts();
    this.drawRings();
    this.drawTexts();
    this.drawBubbles();
    this.drawScreenFx(g, ui);
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

  drawEnemies(g, t) {
    const cx = this.cx;
    const list = this.sorted;
    list.length = 0;
    for (const e of g.enemies) if (!e.dead) list.push(e);
    list.sort((a, b) => a.y - b.y);
    const sh = this.projSprites.shadow;
    // 그림자 먼저
    for (const e of list) {
      const box = e.def.size;
      const w = box * 0.62;
      this.tf(e.x, e.y + box * FEET_OFF, 0, 1, 1);
      cx.drawImage(sh.c, -w / 2, -w * 0.13, w, w * 0.26);
    }
    const focus = g.focus && !g.focus.dead ? g.focus : null;
    // 독재자 오라 (바닥에 붉은 원)
    for (const e of list) {
      if (!e.def.aura) continue;
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
      const sp = this.sprites[key] || this.sprites['e_' + e.type];
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
      if (e.boss) {
        const gl = this.projSprites.glowRed;
        const r = box * (0.6 + Math.sin(t * 4) * 0.05);
        this.tf(e.x, feet - box * 0.1, 0, 1, 0.5);
        cx.drawImage(gl.c, -r, -r, r * 2, r * 2);
      }
      if (e.shield > 0 || e.packN >= 2) {
        const gl = this.projSprites.glowCyan;
        const r = box * (e.shield > 0 ? 0.55 : 0.42);
        this.tf(e.x, e.y - box * 0.12, 0, 1, 1);
        cx.globalAlpha = e.shield > 0 ? 1 : Math.min(0.9, 0.3 + e.packN * 0.15);
        cx.drawImage(gl.c, -r, -r, r * 2, r * 2);
        cx.globalAlpha = 1;
      }
      if (e.dictT > 0 && !def.aura) {
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
      this.tf(e.x, feet + bob, rot, sx, sy);
      const img = e.flash > 0 ? sp.f : sp.c;
      cx.drawImage(img, -box / 2, -box * FEET, box, box);
      // 상태 아이콘 / 체력바는 회전 없이
      const top = feet - box * 0.86;
      if (e.slowT > 0) {
        this.tf(e.x, feet, 0, 1, 0.35);
        cx.strokeStyle = 'rgba(120,200,255,0.85)'; cx.lineWidth = 3;
        cx.beginPath(); cx.arc(0, 0, box * 0.3, 0, TAU); cx.stroke();
      }
      if (e.stunT > 0 || e.windup > 0) {
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
      if (e.form === 'reveal' || e.packN >= 2 || (e.dictT > 0 && !def.aura)) {
        // 상태 글자: 약점 "!" · 뭉침 방패 · 독재자 버프
        const txt = e.form === 'reveal' ? '!' : e.packN >= 2 ? '🛡' : '▲';
        this.tf(e.x + box * 0.28, top - 2, 0, 1, 1);
        cx.font = `900 ${e.form === 'reveal' ? 20 : 11}px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.lineWidth = 3; cx.strokeStyle = 'rgba(15,5,25,0.9)';
        cx.fillStyle = e.form === 'reveal' ? '#ffe14d' : e.packN >= 2 ? '#9feaff' : '#ff6b5a';
        cx.strokeText(txt, 0, 0); cx.fillText(txt, 0, 0);
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

  drawHeroes(g, t) {
    const cx = this.cx;
    const box = HERO_BOX;
    const sh = this.projSprites.shadow;
    for (const h of g.heroes) {
      const feet = h.y + box * FEET_OFF;
      // 발판 빛
      const gl = h.rage ? this.projSprites.glowRed : h.charmT > 0 ? this.projSprites.glowPink : this.projSprites.glowGold;
      const pr = h.rage ? 56 + Math.sin(t * 14) * 8 : 34;
      this.tf(h.x, feet - 2, 0, 1, h.rage ? 0.9 : 0.35);
      cx.globalAlpha = h.rage ? 0.95 : 0.55;
      cx.drawImage(gl.c, -pr, -pr, pr * 2, pr * 2);
      cx.globalAlpha = 1;
      this.tf(h.x, feet, 0, 1, 1);
      cx.drawImage(sh.c, -26, -7, 52, 14);
      const key = h.rage && this.sprites['h_' + h.id + '_rage'] ? 'h_' + h.id + '_rage' : 'h_' + h.id;
      const sp = this.sprites[key];
      if (!sp) continue;
      let bob = Math.sin(t * 3 + h.slot) * 1.2, rot = 0, sx = 1, sy = 1;
      if (h.recoil > 0) { const p = h.recoil / 0.14; sy = 1 + p * 0.07; sx = 1 - p * 0.05; bob -= p * 3; }
      if (h.rage) { rot = Math.sin(t * 24) * 0.05; bob += Math.sin(t * 30) * 1.5; }
      if (h.charmT > 0) { rot = Math.sin(t * 4) * 0.14; }
      if (h.stunT > 0) { rot = Math.sin(t * 10) * 0.1; sy = 0.94; }
      if (h.joinT < 0.4) { const p = h.joinT / 0.4; const e = 1 + Math.sin(p * Math.PI) * 0.3; sx *= e * p; sy *= e * p; }
      if (h.id === 'sunggu') rot += Math.sin(t * 1.5) * 0.03; // 할아버지 휘청
      this.tf(h.x, feet + bob, rot, sx, sy);
      cx.globalAlpha = h.stunT > 0 ? 0.75 : 1;
      cx.drawImage(sp.c, -box / 2, -box * FEET, box, box);
      cx.globalAlpha = 1;
      const top = feet - box * 0.9;
      // 홀림 하트
      if (h.charmT > 0) {
        const hs = this.projSprites.heart;
        for (let i = 0; i < 3; i++) {
          const a = t * 3 + i * TAU / 3;
          this.tf(h.x + Math.cos(a) * 22, top + 6 + Math.sin(a) * 6, 0, 1, 1);
          cx.drawImage(hs.c, -8, -8, 16, 16);
        }
      }
      if (h.stunT > 0) {
        const st = this.projSprites.star;
        for (let i = 0; i < 3; i++) {
          const a = t * 6 + i * TAU / 3;
          this.tf(h.x + Math.cos(a) * 18, top + 4 + Math.sin(a) * 4, a, 0.8, 0.8);
          cx.drawImage(st.c, -8, -8, 16, 16);
        }
      }
      // 뒷담화(수군수군) · 공포 · 유혹 표시
      if (h.rumorT > 0) {
        const rs = this.projSprites.rumor;
        this.tf(h.x + 16, top - 8 + Math.sin(t * 6) * 2, 0, 0.7, 0.7);
        cx.drawImage(rs.c, -rs.w / 2, -rs.h / 2, rs.w, rs.h);
      }
      if (h.fearT > 0) {
        this.tf(h.x - 20, top + 2, 0, 1, 1);
        cx.font = `12px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.fillText('😱', 0, Math.sin(t * 10) * 1.5);
      }
      if (g.flirt && h.def.gender === 'm') {
        const hs = this.projSprites.heart;
        this.tf(h.x - 18, top + 10 + Math.sin(t * 4 + h.slot) * 3, 0, 0.8, 0.8);
        cx.globalAlpha = 0.85;
        cx.drawImage(hs.c, -8, -8, 16, 16);
        cx.globalAlpha = 1;
      }
      // 이름 + 레벨
      this.world();
      const label = h.def.name;
      cx.font = `900 10px ${FONT}`;
      cx.textAlign = 'center';
      cx.textBaseline = 'middle';
      const tw = cx.measureText(label).width + 23;
      const ly = feet + 9;
      cx.fillStyle = h.def.hidden ? 'rgba(80,10,70,0.85)' : 'rgba(12,10,28,0.8)';
      roundRect(cx, h.x - tw / 2, ly - 7, tw, 14, 7);
      cx.fill();
      if (h.def.hidden) { cx.strokeStyle = '#ff7fe6'; cx.lineWidth = 1; cx.stroke(); }
      cx.fillStyle = '#ffe08a';
      cx.fillText(label, h.x - 7, ly + 0.5);
      cx.fillStyle = h.lv >= 5 ? '#ff9f1c' : '#9ee6ff';
      cx.font = `900 9px ${FONT}`;
      cx.fillText(h.lv >= 5 ? 'MAX' : 'Lv' + h.lv, h.x + tw / 2 - 12, ly + 0.5);
      // 최은옥 술 게이지
      if (h.def.soberSec) {
        const max = h.rage ? h.def.rageSec[h.lv - 1] : h.def.soberSec[h.lv - 1];
        const f = h.rage ? h.rageT / max : 1 - h.rageT / max;
        const bw = 34;
        cx.fillStyle = 'rgba(0,0,0,0.6)'; cx.fillRect(h.x - bw / 2, ly + 8, bw, 4);
        cx.fillStyle = h.rage ? '#ff3b30' : '#ffb347'; cx.fillRect(h.x - bw / 2, ly + 8, bw * f, 4);
      }
    }
  }

  drawProjs(g) {
    const cx = this.cx, P = this.projSprites;
    for (const p of g.projs) {
      if (p.dead) continue;
      let s;
      switch (p.type) {
        case 'notice': s = p.big ? P.noticeBig : P.notice; this.tf(p.x, p.y, 0, 1, 1); break;
        case 'bottle': s = p.rage ? P.bottleRage : P.bottle; this.tf(p.x, p.y, p.rot, 1, 1); break;
        case 'wink': s = P.wink; this.tf(p.x, p.y, 0, 1, 1); break;
        case 'flower': s = P.flower; this.tf(p.x, p.y, p.rot * 0.2, 1, 1); break;
        case 'swear': s = p.big ? P.swearBig : P.swear; this.tf(p.x, p.y, Math.sin(p.dist * 0.05) * 0.15, 1, 1); break;
        default: s = P[p.type]; this.tf(p.x, p.y, p.rot, 1, 1);
      }
      if (s) cx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
    }
    for (const q of g.eprojs || []) {
      const s = q.kind === 'duck' ? P.duck : P.rumor;
      this.tf(q.x, q.y, q.kind === 'duck' ? q.t * 12 : Math.sin(q.t * 14) * 0.12, 1, 1);
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
      let s = n.crit ? 1.05 : 0.7;
      if (age < 0.1) s *= 1 + (1 - age / 0.1) * (n.crit ? 1 : 0.5);
      this.tf(n.x, n.y, 0, s, s);
      cx.globalAlpha = Math.min(1, n.life / (n.max * 0.35));
      cx.lineWidth = 4;
      cx.strokeStyle = n.crit ? '#7a1d00' : 'rgba(20,10,30,0.9)';
      cx.strokeText(n.text, 0, 0);
      cx.fillStyle = n.color;
      cx.fillText(n.text, 0, 0);
    }
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
      const s = 1 + fx.comboPop * 0.35;
      const col = fx.combo >= 100 ? '#ff4fd8' : fx.combo >= 50 ? '#ff7b2e' : fx.combo >= 20 ? '#ffd23f' : '#ffffff';
      cx.setTransform(k * s, 0, 0, k * s, k * (W - 50), k * 118);
      cx.font = `900 italic 26px ${FONT}`;
      cx.lineWidth = 6; cx.strokeStyle = 'rgba(20,5,30,0.9)';
      cx.strokeText(fx.combo, 0, 0);
      cx.fillStyle = col; cx.fillText(fx.combo, 0, 0);
      cx.font = `900 italic 11px ${FONT}`;
      cx.lineWidth = 4;
      cx.strokeText('COMBO', 0, 19); cx.fillText('COMBO', 0, 19);
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
