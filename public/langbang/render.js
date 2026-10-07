// 랑방 대전 — 캔버스 렌더러 + 연출(FX)
// 스프라이트는 화면 해상도에 맞춰 미리 구워(bake) 두고 drawImage 만 한다.
// 이미지가 아직 없거나 404 면 색 원 + 이모지 + 이름표 자리표시자로 그린다.
import { HEROES as HEROES0, SUMMONS, ENEMIES, rowYFor, ATTRS, TRAITS, FUSE_ART, ENEMY_ANIM, PROJ_ART, PROJ_ART_NAMES, BUS, ENEMY_ATK, ATK_MOVES, CADENCE, HERO_ANIM, HERO_ANIM_FORM, WEAPON } from './data.js';
// 효과 종류: 빛(더하기 섞기) · 물건(보통) · 층 · 색 · 맞은 자리 표시
const VFX_KIND = {
  soundring: { blend: 'lighter', layer: 'front' },
  banner: { blend: 'source-over', layer: 'ground' },
  winkring: { blend: 'lighter', layer: 'front' },
  _: { blend: 'lighter', layer: 'front' },
  aura_red: { blend: 'lighter', layer: 'ground', col: '#ff4a4a' }, aura_blue: { blend: 'lighter', layer: 'ground', col: '#5ab4ff' },
  crack: { blend: 'source-over', layer: 'ground' }, warn: { blend: 'lighter', layer: 'ground', col: '#ff3a3a' }, summon: { blend: 'lighter', layer: 'ground', col: '#c07bff' },
  shock: { blend: 'lighter', layer: 'front', col: '#ffd27a', impact: true }, shock2: { blend: 'lighter', layer: 'front', col: '#9fd8ff', impact: true },
  hitspark: { blend: 'lighter', layer: 'front', col: '#fff1a8', impact: true }, dash: { blend: 'lighter', layer: 'front', col: '#ffffff' },
  silence: { blend: 'lighter', layer: 'front', col: '#b9a4ff' }, stun: { blend: 'lighter', layer: 'front', col: '#ffd23f' },
  slap: { blend: 'source-over', layer: 'front', impact: true, col: '#ffc08a' }, smoke: { blend: 'source-over', layer: 'front' },
  phone: { blend: 'source-over', layer: 'front' }, barrage_card: { blend: 'source-over', layer: 'front' }, grab: { blend: 'source-over', layer: 'front' },
  pullLine: { blend: 'lighter', layer: 'front' },
};
// 이모지 금지: 캔버스 글자에서도 지운다
const EMO = /\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*/gu;
const noEmo = (s) => (typeof s === 'string' ? s.replace(EMO, '').replace(/\s{2,}/g, ' ').trim() : s);
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
const BG_ROOF = { 2: 0.735, 3: 0.735, 4: 0.735, 5: 0.66, 6: 0.73, 7: 0.73, 8: 0.8 }; // (8장: 축의금 접수대 윗면이 멤버 줄 바로 뒤) // (7장: bg7 그림이 오면 이 값을 그림에 맞게)
const MAP_ROOF = 0.735; // 레이드 · 대전 맵: 랑방 지붕 높이 (그림 높이의 비율 · bg2~4 와 같게)
const BG_BRIGHT = { 4: 0.42, 6: 0.36, 7: 0.4, 8: 0.34 }; // (8장: 흰 버진로드) // 밝은 길(제주 · 눈길) — 진상이 잘 보이게 길을 어둡게
// 챕터별 분위기 (같은 배경 그림에 색만 덧씌운다)
// 있으면 쓰는 그림 주소 (서버 /api/langbang/anim 의 files 와 같은 규칙)
const OPT_ART = /^\/img\/lb\/(arena\d|map_[a-z0-9_]+|e_[a-z0-9_]+_(skill|rage)|h_wonsik_walk(back|front)|h_youngjun_rest)\.webp$|^\/img\/lb\/fx\/p_[A-Za-z0-9_]+\.webp$/;
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
  num(x, y, v, crit, color, eff = 0, uid = 0) {
    const items = this.nums.items;
    // 같은 진상에게 0.2초 안에 들어간 피해는 (치명타든 아니든) 숫자 하나로 합친다 — 숫자끼리 겹쳐 "47247201062!" 처럼 안 보이게
    //  uid(진상 번호)가 있으면 그걸로, 없으면 가까운 자리로 같은 진상인지 본다
    for (let i = items.length - 1; i >= 0; i--) {
      const o = items[i];
      if (this.time - (o.lastT || 0) > 0.2) continue;
      if (uid ? o.uid === uid : Math.abs(o.x0 - x) < 18 && Math.abs(o.y0 - y) < 26) {
        o.val += v; o.lastT = this.time;
        if (crit && !o.crit) { o.crit = true; o.vy = Math.min(o.vy, -60); o.max = 0.9; if (!o.fixedColor) o.color = '#ff7a1a'; }
        if (eff > o.eff) o.eff = eff;
        o.x += x - o.x0; o.x0 = x; o.y0 = y; // 걸어가는 진상을 따라간다
        o.text = o.crit ? o.val + '!' : '' + o.val; o.life = o.max; o.pop = 0.08; return;
      }
    }
    // 화면에 12개까지: 넘으면 가장 오래된 것부터 빨리 사라지게
    if (items.length >= 12) { let old = null; for (const o of items) if (!o.crit && (!old || o.life < old.life)) old = o; if (old) old.life = Math.min(old.life, 0.1); else if (!crit) return; }
    const n = this.nums.get();
    if (!n) return;
    // 가까운 숫자가 있으면 위로 한 칸씩 쌓고 옆으로 살짝 비켜서
    let stack = 0;
    for (const o of items) if (o !== n && Math.abs(o.x0 - x) < 34 && Math.abs(o.y0 - y) < 40 && o.max - o.life < 0.45) stack++;
    n.x0 = x; n.y0 = y; n.val = v; n.pop = 0; n.uid = uid; n.lastT = this.time; n.fixedColor = !!color;
    n.x = x + (Math.random() - 0.5) * 20 + (stack % 2 ? 9 : -9) * Math.min(stack, 1); n.y = y - Math.min(stack, 4) * 15; n.vy = crit ? -70 : eff > 0 ? -60 : -48; n.life = crit ? 0.9 : eff > 0 ? 0.8 : 0.6; n.max = n.life;
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
    text = noEmo(text);
    const t = this.texts.get();
    if (!t) return;
    life = Math.min(life, 0.9); // 외침 글자는 짧게 · 피해 숫자보다 조금 위에 (겹치지 않게)
    y -= 16;
    { const hw = Math.max(50, String(text).length * size * 0.48 + 6); x = Math.max(hw, Math.min(360 - hw, x)); } // 화면 끝에서 잘리지 않게 ("이어트 주사!" · 긴 글자는 글자 폭만큼)
    // 이미 떠 있는 글자와 겹치면 한 줄씩 위로 비켜서 ("빈틈! 지금이야!" 위에 "꼬충 호출!" 겹침 방지)
    for (let k = 0; k < 4; k++) {
      let hit = false;
      for (const o of this.texts.items) if (o !== t && o.life > 0.15 && Math.abs(o.x - x) < 80 && Math.abs(o.y - y) < (o.size + size) * 0.62) { hit = true; break; }
      if (!hit) break;
      y -= size * 1.3;
    }
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
    text = noEmo(text); sub = noEmo(sub);
    if (this.noBanner) return; // 메뉴 뒤 데모 판에서는 배너 생략
    // 같은 종류가 이미 대기 중이면 교체
    if (this.banners.length > 2) { const i = this.banners.findIndex((x, j) => j > 0 && x.kind !== 'boss'); this.banners.splice(i > 0 ? i : 1, 1); }
    this.banners.push({ text, sub, color, life, max: life, kind, sprite, t: 0 });
    this.bannerAt = this.time; // 스킬 컷인이 "이 스킬은 같은 프레임에 큰 배너를 띄웠나" 확인용 (이름을 한 번만 보이게)
  }
  flash(color, a) { this.flashColor = color; this.flashA = Math.max(this.flashA, a); }
  addShake(v) { if (v < 3) return; this.shake = Math.min(18, Math.max(this.shake, v)); } // 작은 흔들림은 무시 (큰 한 방·보스만)
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
    //  (보스 등장 배너는 끝까지 — 뒤에 밀린 합류 배너가 보스 소개를 잘라 먹지 않게)
    if (b) { b.t += dt * (this.banners.length > 1 && b.kind !== 'boss' ? 2.2 : 1); if (b.t >= b.life) this.banners.shift(); }
  }
}

// ─── 렌더러 ───────────────────────────────────────────
const PAINTED = { crownIco: 'pCrown', bottle: 'pBottle', bottleRage: 'pBottleRage' };
// (대개편) 건전남 권총 · 박상화 장미 · 운영진 딱지 · 오지은 시계 · 서명훈 번개 · 홍정민 휘두르기 · 임수빈 리본 · 박나영 불은 kitfx.js 가 코드로 그린다
const JY_CHIPS = ['#e53935', '#1e6fe0', '#2e9e4a', '#222', '#f2b01e', '#8e44ad']; // 성준영 배팅 칩 색
const PAINTED_MORE = ['bullet', 'cane', 'wink', 'swear', 'swearBig', 'notice', 'noticeBig', 'flower', 'rose', 'chip', 'card', 'tick', 'dumbbell', 'snack', 'hammer', 'note', 'heartBomb', 'duck', 'paper', 'gem', 'mosaic'];
for (const n of PAINTED_MORE) PAINTED[n] = 'p_' + n; // 그린 투사체: fx/p_<이름>.webp (없으면 코드로 그린 것)
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
    this.optQ = [];
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
    for (const id in ENEMIES) if (ENEMIES[id].fb) list['fb:' + ENEMIES[id].fb] = ENEMIES[id].fb; // 7장: 그림이 아직 없을 때 쓸 비슷한 진상 그림 (색만 입힘)
    for (const id in HERO_ANIM) list['hanim_' + id] = HERO_ANIM[id].src; // 멤버 공격 프레임 띠
    for (const id in HEROES) if (HEROES[id].skill) list['sk_' + id] = `/img/lb/ui2/sk_${id}.webp`; // 스킬 아이콘 (준비 표시 · 쓸 때 터짐)
    list.ui2_shield = '/img/lb/ui2/shield.webp';
    list.ws_back = '/img/lb/h_wonsik_back.webp'; list.ws_consult = '/img/lb/h_wonsik_consult.webp'; list.ws_walkb = '/img/lb/h_wonsik_walkback.webp'; list.ws_walkf = '/img/lb/h_wonsik_walkfront.webp'; // 정원식 결정사 상담
    list.vfx_soundring = '/img/lb/fx/vfx_soundring.webp'; list.vfx_banner = '/img/lb/fx/vfx_banner.webp'; // 방장 음파 · 집합 깃발
    list.dh_tf = '/img/lb/h_donghan_transform.webp'; // 문동한 진심 모드 변신 (12칸 · 한 번)
    list.h_donghan_ssj = '/img/lb/h_donghan_ssj.webp'; list.dh_ssj_tf = '/img/lb/h_donghan_ssj_tf.webp'; list.dh_ssj_cast = '/img/lb/h_donghan_ssj_attack.webp'; // 문동한 초사이언: 금빛 모습 · 변신 8칸 · 포격 8칸
    list.dohoon_idle = '/img/lb/h_dohoon_idle.webp'; list.dohoon_encore = '/img/lb/h_dohoon_encore.webp'; // 김도훈: 리듬 타기 8칸(평소) · 앵콜 8칸
    list.vfx_winkring = '/img/lb/fx/vfx_winkring.webp'; list.hanna_back = '/img/lb/h_hanna_back.webp'; // 이한나 데스 윙크
    list.hanim_youngjun_rest = '/img/lb/h_youngjun_rest.webp'; // 김영준 숨 고르기 (크로스핏 8칸 · 있으면)
    list.hanim_baul_ride = '/img/lb/h_baul_ride.webp'; list.hanim_baul_fix = '/img/lb/h_baul_fix.webp'; // 송바울 보드 타기 · 보드 정비 (8칸 반복)
    list.hanim_junyoung_sweep = '/img/lb/h_junyoung_sweep.webp'; // 성준영 칩 갈퀴로 배팅 칩 긁어모으기 (8칸 반복)
    list.js_back = '/img/lb/h_jeongseob_back.webp'; list.js_walk = '/img/lb/h_jeongseob_walkfront.webp'; list.js_walkb = '/img/lb/h_jeongseob_walkback.webp'; list.js_rest = '/img/lb/h_jeongseob_rest.webp'; // 윤정섭 걷기 · 쉬기
    for (const id in HERO_ANIM_FORM) list['hanim_' + id + '_f'] = HERO_ANIM_FORM[id].src; // 변신 모습 띠
    for (const n of PROJ_ART_NAMES) list['w_' + n] = `/img/lb/fx/w_${n}.webp`; // 투사체 그림 (없으면 코드 모양)
    for (const n of ['syringe', 'banknote', 'bandage', 'mosaic_hand', 'censor']) list['sk_fx_' + n] = `/img/lb/fx/p_sk_${n}.webp`; // 스킬 연출 그림 (있으면 · 없으면 코드 모양)
    list.bus = '/img/lb/fx/bus.webp'; list.bus2 = '/img/lb/fx/bus2.webp';
    for (const n of ['cc_pull', 'cc_stun', 'cc_slow', 'cc_freeze', 'cc_push']) list[n] = `/img/lb/ui2/${n}.webp`;
    for (const n of ['hitspark', 'smoke', 'slap', 'grab', 'phone', 'shock', 'shock2', 'crack', 'summon', 'silence', 'stun', 'dash', 'aura_red', 'aura_blue', 'warn', 'barrage_card', 'arm']) list['vfx_' + n] = `/img/lb/fx/vfx_${n}.webp`; // 이펙트 그림
    for (const id in ENEMY_ANIM) for (const k in ENEMY_ANIM[id]) list[`anim_${id}_${k}`] = ENEMY_ANIM[id][k].src; // 프레임 띠 (없으면 요청 실패 → 코드 움직임)
    for (const id of FUSE_ART) if (ENEMIES[id]) { const key = `e_${id}_one`; list[key] = `/img/lb/e_${id}.webp`; this.formDefs[key] = ENEMIES[id]; } // 합체 한 장 그림
    for (const id in ENEMIES) if (ENEMIES[id].boss) for (const f of ['skill', 'rage']) { const key = `e_${id}_${f}`; list[key] = `/img/lb/e_${id}_${f}.webp`; this.formDefs[key] = Object.assign({}, ENEMIES[id], { id: `${id}_${f}` }); } // 보스 기술 · 분노 모습 (없으면 기본 그림)
    list.moto = '/img/lb/p_motorcycle.webp';
    list.ingyuBike = '/img/lb/h_ingyu_bike.webp'; // 백인규 할리 돌진
    list.gf = '/img/lb/p_girlfriend.webp';
    for (let i = 0; i < 4; i++) list['bar' + i] = `/img/lb/ui/barricade_${i}.webp`;
    for (const k of ['heart', 'fire', 'electric', 'gold', 'shock', 'spark']) list['fx_' + k] = `/img/lb/fx/${k === 'shock' ? 'shock_ring' : k === 'spark' ? 'hit_spark' : 'explo_' + k}.webp`;
    for (const n of PAINTED_MORE) list['p_' + n] = `/img/lb/fx/p_${n}.webp`;
    list.pCrown = '/img/lb/fx/p_crown.webp'; list.pBottle = '/img/lb/fx/p_bottle.webp'; list.pBottleRage = '/img/lb/fx/p_bottle_rage.webp'; // 그린 투사체 (없으면 코드로 그린 것)
    for (const k of ['talk', 'power', 'charm', 'booze']) list['attr_' + k] = `/img/lb/attr/${k}.webp`; // 속성 배지 그림
    list.bg = '/img/lb/bg.webp';
    list.bg2 = '/img/lb/bg2.webp';
    list.bg3 = '/img/lb/bg3.webp';
    list.bg4 = '/img/lb/bg4.webp';
    list.bg5 = '/img/lb/bg5.webp';
    list.bg6 = '/img/lb/bg6.webp';
    list.bg7 = '/img/lb/bg7.webp'; // 7장 스키장 (없으면 bg6 에 얼음빛)
    list.bg8 = '/img/lb/bg8.webp'; // 8장 결혼식 뒤풀이 (위 꽃 아치 → 버진로드 → 아래 축의금 접수대)
    list.pBouquet = '/img/lb/fx/p_bouquet.webp'; // 8장 임수빈 부케
    for (let i = 1; i <= 8; i++) list['arena' + i] = `/img/lb/arena${i}.webp`; // 보스 무대 (없으면 챕터 배경 + 붉은 조명)
    list.map_raid = '/img/lb/map_raid.webp'; list.map_pvp = '/img/lb/map_pvp.webp'; // 레이드 · 1:1 대전 전용 맵 (없으면 원래 배경)
    list.base = '/img/lb/base.webp';
    const skip = new URLSearchParams(location.search).has('noimg');
    const q = [];
    for (const key in list) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (key.startsWith('sk_')) return;
        if (key === 'moto' || key === 'gf' || key === 'ingyuBike' || key.startsWith('anim_') || key.startsWith('w_') || key.startsWith('vfx_') || key.startsWith('hanim_') || key.startsWith('cc_') || key === 'bus' || key === 'bus2') return;
        if (key.startsWith('bar')) { this.bakeBar(key); return; }
        if (key.startsWith('fx_')) return;
        if (key.startsWith('fb:')) { for (const id in ENEMIES) if (ENEMIES[id].fb === list[key]) this.bakeSprite('e_' + id); return; }
        if (key === 'bg' || key === 'base' || /^bg\d$/.test(key) || key.startsWith('map_')) this.bakeBg();
        else this.bakeSprite(key);
      };
      // 있으면 쓰는 그림(보스 무대 · 그린 투사체 · 모드 맵 …)은 서버 파일 목록이 온 뒤에 있는 것만 요청 (없는 파일 404 폭탄 방지)
      if (!skip && list[key]) (OPT_ART.test(list[key]) ? this.optQ : q).push([img, list[key]]);
      this.images[key] = img;
    }
    // 한꺼번에 수백 장을 요청하면 브라우저가 거절한다 (ERR_INSUFFICIENT_RESOURCES) → 16장씩 차례로
    let on = 0;
    const pump = () => { while (on < 16 && q.length) { const [im, src] = q.shift(); on++; const done = () => { on--; pump(); }; im.addEventListener('load', done, { once: true }); im.addEventListener('error', done, { once: true }); im.src = src; } };
    this.imgQ = q; this.imgPump = pump;
    pump();
  }
  // 서버가 알려준 "있는 파일" 목록으로 미뤄 둔 그림을 불러온다 (files 가 없으면 = 목록을 못 받음 → 예전처럼 전부 시도)
  loadOptional(files) {
    if (!this.optQ) return;
    const have = Array.isArray(files) ? new Set(files) : null;
    for (const it of this.optQ) if (!have || have.has(it[1])) this.imgQ.push(it);
    this.optQ = null;
    this.imgPump();
  }

  // 서버 목록으로 새 진상 프레임 띠 붙이기 (걷기 12칸 · 쓰러짐 8칸 · 공격 8칸 기본)
  addEnemyAnims(map) {
    for (const [id, kinds] of Object.entries(map || {})) {
      if (!ENEMIES[id]) continue;
      const cur = ENEMY_ANIM[id] || (ENEMY_ANIM[id] = {});
      for (const kd of kinds) {
        if (cur[kd]) continue;
        cur[kd] = kd === 'walk' ? { src: `/img/lb/e_${id}_walk.webp`, frames: 12, fps: 10 } : kd === 'die' ? { src: `/img/lb/e_${id}_die.webp`, frames: 8, fps: 14, hold: ENEMIES[id].boss ? 0.3 : 0.15 } : { src: `/img/lb/e_${id}_attack.webp`, frames: 8, release: 3 };
        const key = `anim_${id}_${kd}`;
        if (this.images[key]) continue;
        const img = new Image(); img.decoding = 'async'; img.src = cur[kd].src; this.images[key] = img;
      }
    }
    // 각성 · 합체 진상은 일반 진상 그림을 빌려 쓴다 → 걷기 · 쓰러짐 · 공격 띠도 같이 빌린다 (예전엔 각성 꼰대만 미끄러지듯 움직였다)
    for (const [id, def] of Object.entries(ENEMIES)) {
      const m = /\/e_([a-z0-9_]+)\.webp$/.exec(def.img || '');
      const base = m && m[1];
      if (!base || base === id || !ENEMY_ANIM[base]) continue;
      const cur = ENEMY_ANIM[id] || (ENEMY_ANIM[id] = {});
      for (const kd of ['walk', 'die', 'attack']) {
        if (cur[kd] || !ENEMY_ANIM[base][kd] || !this.images[`anim_${base}_${kd}`]) continue;
        cur[kd] = ENEMY_ANIM[base][kd];
        this.images[`anim_${id}_${kd}`] = this.images[`anim_${base}_${kd}`];
      }
    }
  }

  // mode: 'raid' | 'pvp' 면 전용 맵(map_<mode>.webp)이 있을 때 그걸로 · 없으면 t 테마 그대로
  setTheme(t, mode = null) {
    const key = t || 1;
    if (this.themeKey === key && this.modeKey === mode) return;
    this.themeKey = key;
    this.modeKey = mode;
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
    this.bakeSprite('h_donghan_ssj'); // 문동한 초사이언 모습
    for (const id in ENEMIES) this.bakeSprite('e_' + id);
    for (const key in this.formDefs) this.bakeSprite(key);
    this.bakeProj();
    this.bakeBg();
  }

  // 캐릭터 스프라이트 굽기: 일반 + 흰색 번쩍 버전
  bakeSprite(key) {
    const isHero = key[0] === 'h';
    const rage = key.endsWith('_rage');
    const id = key.slice(2).replace('_rage', '').replace(/_(alt|ssj)$/, '');
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
      if (isHero && false) { // (사용자 요청: 캐릭터 둘레 흰·색 테두리 없음 — 발밑 그림자만)
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
    } else if (!isHero && def.fb && imgOk(this.images['fb:' + def.fb])) {
      // 7장: 전용 그림이 오기 전엔 비슷한 진상 그림에 그 진상 색을 입혀서
      x.imageSmoothingQuality = 'high';
      x.drawImage(this.images['fb:' + def.fb], 0, 0, px, px);
      x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 0.42; x.fillStyle = def.color; x.fillRect(0, 0, px, px);
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
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

  // 진상의 탑 지옥 각성 (60층): 발밑 불꽃 고리 + 붉은 오라 + 올라가는 불티 — 그림(fx/awake_aura.webp)이 오면 그걸로, 없으면 불꽃 고리 그림
  drawAwake(h, hx, feet, box, t) {
    const cx = this.cx;
    if (!this.images.awakeAura) { const im = new Image(); im.decoding = 'async'; im.src = this.awakeAuraSrc || '/img/lb/fx/vfx_aura_red.webp'; this.images.awakeAura = im; } // (tower-ui 가 그림 주소를 알려 준다)
    const gl = this.projSprites.glowRed, pr = box * (0.62 + Math.sin(t * 5 + h.slot) * 0.05);
    this.tf(hx, feet - box * 0.45, 0, 1, 1);
    cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.42 + Math.sin(t * 3.3) * 0.12;
    if (gl) cx.drawImage(gl.c, -pr, -pr * 1.25, pr * 2, pr * 2.5);
    cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
    const ring = this.images.awakeAura;
    if (imgOk(ring)) { this.tf(hx, feet - 4, 0, 1, 0.36); cx.globalAlpha = 0.85; const rw = box * (0.95 + Math.sin(t * 6) * 0.03); cx.drawImage(ring, -rw / 2, -rw * 0.72, rw, rw); cx.globalAlpha = 1; }
    if (Math.random() < 0.35) this.fx.part('flame', hx + (Math.random() - 0.5) * box * 0.5, feet - Math.random() * box * 0.5, (Math.random() - 0.5) * 20, -60 - Math.random() * 50, 0.7, 6 + Math.random() * 5, null);
  }
  drawAwakeEyes(h, hx, feet, box, t) {
    const cx = this.cx, gl = this.projSprites.glowRed;
    if (!gl) return;
    const y = feet - box * (h.def.scale ? 0.86 : 0.78), k = 0.8 + Math.sin(t * 9 + h.slot) * 0.2;
    this.world();
    cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.55 * k;
    for (const s0 of [-1, 1]) cx.drawImage(gl.c, hx + s0 * box * 0.07 - 7, y - 4, 14, 8);
    cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
  }
  // 헬 모드용: 붉은 기운을 미리 구운 그림 (진상마다 빛을 따로 그리지 않게)
  // 「모자이크」 걸린 진상: 그림을 아주 작게 줄였다가(평균색) 매끈하게 하지 않고 다시 키워 네모 깨짐 (그림마다 한 번만 굽는다)
  mosaicSprite(sp) {
    if (sp.mz) return sp.mz;
    const N = 14, S = N * 8;
    const sm = mkCanvas(N, N), x0 = sm.getContext('2d');
    x0.drawImage(sp.c, 0, 0, N, N);
    const c = mkCanvas(S, S), x = c.getContext('2d');
    x.imageSmoothingEnabled = false; x.drawImage(sm, 0, 0, S, S);
    x.globalCompositeOperation = 'source-atop'; x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 1; // 네모 칸 경계 살짝
    x.beginPath(); for (let i = 1; i < N; i++) { x.moveTo(i * 8 + 0.5, 0); x.lineTo(i * 8 + 0.5, S); x.moveTo(0, i * 8 + 0.5); x.lineTo(S, i * 8 + 0.5); } x.stroke();
    sp.mz = c;
    return c;
  }
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
    x.fillText(rage ? '' : def.emoji, cx, cy - r * 0.08);
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
      this.projSprites[name] = { c, w, h, paint: PAINTED[name] };
    };
    make('notice', 34, 24, (x, w, h) => {
      glow(x, w / 2, h / 2, 16, 'rgba(255,210,63,0.45)');
      x.fillStyle = '#ffd23f'; x.strokeStyle = '#6b4a00'; x.lineWidth = 1.6;
      roundRect(x, 3, 3, w - 6, h - 9, 6); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(9, h - 6); x.lineTo(7, h - 1); x.lineTo(14, h - 6); x.fill();
      x.fillStyle = '#3a2600'; x.font = `900 10px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('공지', w / 2, h / 2 - 2);
    });
    // 운영진 경고장: 심판 카드처럼 (둥근 모서리 · 진한 테두리 · 안쪽 흰 선 · 느낌표) — 노랑(경고) · 빨강(강퇴)
    const refCard = (fill, dark, mark) => (x, w, h) => {
      glow(x, w / 2, h / 2, 15, fill === '#ffd23f' ? 'rgba(255,214,60,0.5)' : 'rgba(255,70,60,0.55)');
      x.fillStyle = fill; x.strokeStyle = dark; x.lineWidth = 2;
      roundRect(x, 3, 2, w - 6, h - 4, 3.5); x.fill(); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = 1; roundRect(x, 5.5, 4.5, w - 11, h - 9, 2); x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.moveTo(6, 5); x.lineTo(w * 0.55, 5); x.lineTo(6, h * 0.42); x.closePath(); x.fill(); // 반짝
      x.fillStyle = dark; x.font = `900 ${Math.round(h * 0.5)}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(mark, w / 2, h / 2 + 1);
    };
    make('staffCard', 22, 30, refCard('#ffd23f', '#5a3a00', '!'));
    make('staffCardRed', 26, 34, refCard('#ff3b30', '#4a0800', '!!'));
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
      x.fillStyle = '#d81b60'; x.font = `900 9px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('A', w / 2, h / 2 + 1);
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
    make('rumor', 60, 26, (x, w, h) => {
      glow(x, w / 2, h / 2, 16, 'rgba(170,140,255,0.45)');
      x.fillStyle = '#efe8ff'; x.strokeStyle = '#3a2470'; x.lineWidth = 1.5;
      roundRect(x, 3, 3, w - 6, h - 9, 9); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(10, h - 6); x.lineTo(7, h - 1); x.lineTo(15, h - 6); x.fill();
      x.fillStyle = '#5a3ab0'; x.font = `900 11px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('수군수군', w / 2, h / 2 - 2);
    });
    make('ep_snowball', 24, 24, (x, w, h) => { // 7장 눈덩이
      glow(x, w / 2, h / 2, 12, 'rgba(190,240,255,0.6)');
      x.fillStyle = '#f4fbff'; x.strokeStyle = '#7fc8ef'; x.lineWidth = 1.6;
      x.beginPath(); x.arc(w / 2, h / 2, 7.5, 0, TAU); x.fill(); x.stroke();
      x.fillStyle = 'rgba(160,210,240,0.8)'; x.beginPath(); x.arc(w / 2 + 2.5, h / 2 + 2.5, 2.4, 0, TAU); x.fill();
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
    make('mosaic', 22, 22, (x, w, h) => { // 여지원: 모자이크 처리된 손 (픽셀 네모)
      const c = ['#f2c7a8', '#d9a07f', '#f7d9c4', '#c98e6e', '#e8b896'];
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { if ((i === 0 || i === 4) && (j === 0 || j === 4)) continue; x.fillStyle = c[(i * 3 + j * 7) % 5]; x.fillRect(1 + i * 4, 1 + j * 4, 4, 4); }
      x.strokeStyle = 'rgba(40,10,20,0.8)'; x.lineWidth = 1; x.strokeRect(1.5, 1.5, 19, 19);
    });
    make('jab', 20, 16, (x, w, h) => {
      glow(x, w / 2, h / 2, 10, 'rgba(255,120,90,0.6)');
      x.fillStyle = '#ff5a4f'; x.strokeStyle = '#fff'; x.lineWidth = 1.4;
      roundRect(x, 3, 3, w - 6, h - 6, 5); x.fill(); x.stroke();
    });
    make('jabGlove', 24, 20, (x, w, h) => { // 배현경 날씬 잽: 분홍 복싱 글러브 (오른쪽을 봄 · 날아가는 쪽으로 돌려 그림)
      glow(x, w / 2, h / 2, 11, 'rgba(255,120,180,0.55)');
      x.fillStyle = '#ff5c9e'; x.strokeStyle = '#5a0a2e'; x.lineWidth = 1.4;
      x.beginPath(); x.ellipse(14.5, 10.5, 8, 7.2, 0, 0, TAU); x.fill(); x.stroke(); // 주먹
      x.beginPath(); x.ellipse(11.5, 5, 4.2, 2.9, -0.3, 0, TAU); x.fill(); x.stroke(); // 엄지
      x.fillStyle = '#fff2f8'; x.fillRect(3, 6, 5.5, 9); x.strokeRect(3, 6, 5.5, 9); // 손목 띠
      x.fillStyle = 'rgba(255,255,255,0.75)'; x.beginPath(); x.ellipse(16.5, 7.5, 3, 1.7, -0.4, 0, TAU); x.fill(); // 반짝
    });
    make('jmBottle', 16, 38, (x, w, h) => { // 홍정민: 거꾸로 든 초록 소주병 (위가 바닥 · 아래가 뚜껑)
      glow(x, w / 2, h / 2, 15, 'rgba(120,230,150,0.35)');
      x.fillStyle = '#2fae5c'; x.strokeStyle = '#0b3a1c'; x.lineWidth = 1.3;
      x.beginPath(); x.moveTo(2.5, 4); x.quadraticCurveTo(2.5, 1.5, 5, 1.5); x.lineTo(w - 5, 1.5); x.quadraticCurveTo(w - 2.5, 1.5, w - 2.5, 4); x.lineTo(w - 2.5, 22); x.quadraticCurveTo(w - 2.5, 26, w / 2 + 2.6, 29); x.lineTo(w / 2 + 2.6, h - 5); x.lineTo(w / 2 - 2.6, h - 5); x.lineTo(w / 2 - 2.6, 29); x.quadraticCurveTo(2.5, 26, 2.5, 22); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#f4f1e4'; x.fillRect(3, 8, w - 6, 9); x.fillStyle = '#2a8a4a'; x.fillRect(5, 11, w - 10, 1.6); x.fillRect(6, 13.6, w - 12, 1.2); // 라벨
      x.fillStyle = '#1f6e3a'; x.fillRect(w / 2 - 3.2, h - 5.5, 6.4, 4); x.strokeRect(w / 2 - 3.2, h - 5.5, 6.4, 4); // 뚜껑
      x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(4.2, 3, 1.8, 17); x.fillRect(w / 2 - 1.4, 29, 1.1, h - 36); // 유리 반짝
    });
    make('glow', 44, 44, (x, w, h) => { // 송바울 응원봉: 빛나는 막대 + 하트 머리 (코드로 그린 자리표시 · 빙글빙글 돈다)
      glow(x, w / 2, h / 2, 21, 'rgba(122,208,255,0.55)');
      x.save(); x.translate(w / 2, h / 2); x.rotate(-0.6);
      const gr = x.createLinearGradient(0, -14, 0, 12); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#9fe6ff'); gr.addColorStop(1, '#ff8fd0');
      x.fillStyle = gr; x.strokeStyle = '#1d5f8a'; x.lineWidth = 1.3;
      roundRect(x, -3.5, -9, 7, 17, 3.5); x.fill(); x.stroke(); // 빛나는 막대
      x.fillStyle = '#2b2b3a'; roundRect(x, -3, 8, 6, 6, 2); x.fill(); // 손잡이
      heart(x, 0, -12, 5.5, '#ff5fb0', '#fff'); // 하트 머리
      x.restore();
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
    for (const [k, em] of [['sarcasm', ''], ['golf', ''], ['bag', ''], ['stamp', ''], ['glow', '']]) {
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
    const ch0 = typeof this.themeKey === 'number' && this.themeKey >= 2 && this.themeKey <= 8 ? this.themeKey : 0;
    const ch = ch0 >= 7 && !imgOk(this.images['bg' + ch0]) ? 6 : ch0; // 7장 배경(bg7)이 아직 없으면 연말 눈길(bg6)로
    // 레이드 · 1:1 대전: 전용 맵(map_raid / map_pvp)이 있으면 그걸로 · 없으면 원래 테마 배경 그대로
    const modeMap = this.modeKey && imgOk(this.images['map_' + this.modeKey]) ? this.images['map_' + this.modeKey] : null;
    const arena = !modeMap && this.arenaOn && imgOk(this.images['arena' + (ch0 || 1)]) ? this.images['arena' + (ch0 || 1)] : null;
    const own = !arena && !modeMap && ch && imgOk(this.images['bg' + ch]); // 챕터 전용 배경이 있으면 그걸로 (색은 살짝만)
    const img = modeMap || arena || (own ? this.images['bg' + ch] : this.images.bg);
    const rowY = rowYFor(H);
    if (imgOk(img)) {
      const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
      let dy = rowY + 10 - (own ? BG_ROOF[ch] : modeMap ? MAP_ROOF : 0.7) * dh; // 배경의 랑방 건물 지붕이 영웅 줄 바로 뒤에 오도록
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
    const th = (own || modeMap) && th0 ? Object.assign({}, th0, { wash: 'rgba(0,0,0,0)', top: 'rgba(0,0,0,0)', bottom: 'rgba(0,0,0,0)' }) : th0;
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
    // 보스 무대: 어둡게 + 가운데 조명 + 붉은 경고 테두리
    if (this.arenaOn) {
      x.fillStyle = 'rgba(6,2,14,0.38)'; x.fillRect(0, 0, W, H);
      g = x.createRadialGradient(W / 2, H * 0.3, 10, W / 2, H * 0.3, W * 0.7);
      g.addColorStop(0, 'rgba(255,240,210,0.22)'); g.addColorStop(1, 'rgba(255,240,210,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      g = x.createRadialGradient(W / 2, H * 0.45, H * 0.28, W / 2, H * 0.5, H * 0.78);
      g.addColorStop(0, 'rgba(160,0,20,0)'); g.addColorStop(1, 'rgba(170,0,20,0.42)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
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

    const demo = !!(this.fx && this.fx.noBanner); // 로비 뒤 구경 판: 입구(바리케이드·간판)는 안 그린다
    if (!demo) this.drawRopeShadow(g);
    this.drawMapFxUnder(g, t);
    this.drawGems(g, t);
    if (this.skfx) this.skfx.draw('ground', g); // 스킬 전용 연출 (skillfx.js) — 바닥
    if (this.kit) this.kit.draw('ground', g); // 대개편 장판 · 음파 고리 (kitfx.js)
    if (this.efx) this.efx.draw('ground', g); // 진상 기술 예고 표적 · 입구 경고 (enemyfx.js)
    this.drawVfx('ground'); // 바닥 무늬: 금 · 경고 원 · 소환진 · 오라 (캐릭터 발밑 · 납작하게)
    if (g.r2 && this.r2Draw) this.r2Draw(g, t, 'back'); // 건물주 레이드: 거대 보스 · 공격 예고 구역 (raid2-ui.js)
    this.drawEnemies(g, t);
    this.drawJoinWait(g);
    if (!demo) this.drawRope(g, t);
    if (this.skfx) this.skfx.draw('gate', g); // 입구 위 (붕대)
    this.drawEnemies(g, t, true); // 때리는 진상은 바리케이드 앞
    if (g.twa && this.twaDraw) this.twaDraw(g, t, 'back'); // 진상의 탑: 바닥 예고 · 독 웅덩이 · 기 모으기 (tower-arena-ui.js · 바리케이드 바닥 위 · 멤버 아래)
    this.drawPools(g, t);
    if (this.efx) this.efx.draw('feet', g); // 진상 기술 표적 (멤버 발밑 · 입구 경고) — 바리케이드 위 · 멤버 아래
    this.drawHeroes(g, t, ui);
    this.drawBeams(g, t);
    this.drawProjs(g);
    if (this.kit) this.kit.draw('mid', g); // 대개편: 화염 · 휘두르기 · 진상 상태 (kitfx.js)
    if (this.efx) this.efx.draw('mid', g);
    if (g.buses && g.buses.length) this.drawBuses(g);
    this.drawSlashes();
    this.drawDoorHits();
    this.drawVfx('front');
    if (this.skfx) this.skfx.draw('mid', g); // 캐릭터 위 (오라 · 시간 정지 회색)
    if (!demo && this._skOverlay) this._skOverlay();
    this.drawArcs();
    this.drawBlasts();
    this.drawParts();
    this.drawRings();
    if (g.r2 && this.r2Draw) this.r2Draw(g, t, 'top'); // 건물주 레이드: 날아오는 고지서 · 돈다발
    if (g.twa && this.twaDraw) this.twaDraw(g, t, 'top'); // 진상의 탑: 멤버 체력 · 상태 · 끌기 화살표
    if (this.skfx) this.skfx.draw('top', g); // 입자 위 · 글자 아래 (주사기 · 금화 · 띠)
    if (this.kit) this.kit.draw('top', g); // 대개편 스킬 연출 (kitfx.js)
    if (this.efx) this.efx.draw('top', g);
    this.drawTexts();
    this.drawBubbles();
    this.drawUiWorld(g, t, ui);
    this.drawScreenFx(g, ui);
  }

  // 불바다 (최은옥 분노 소주병) · 토 웅덩이
  drawPools(g, t) {
    const cx = this.cx;
    // 보스 예고: 노리는 멤버 발밑 빨간 원 · 분노한 보스는 붉게
    for (const e of g.enemies) {
      if (e.dead || !e.bai) continue;
      if (e.bai.st === 'windup' && e.bai.targets.length) { this.world(); const k = 1 - e.bai.t / 1.0; cx.strokeStyle = '#ff2a2a'; cx.lineWidth = 3; cx.globalAlpha = 0.5 + k * 0.5; for (const h of e.bai.targets) { cx.beginPath(); cx.arc(h.x, h.y + 6, 26 - k * 8, 0, TAU); cx.stroke(); } cx.globalAlpha = 1; }
      if (e.bai.p2) { const gl = this.projSprites.glowRed; const r = e.def.size * 0.7; this.tf(e.x, e.y - e.def.size * 0.3, 0, 1, 1); cx.globalAlpha = 0.55 + Math.sin(this.fx.time * 8) * 0.15; cx.drawImage(gl.c, -r, -r, r * 2, r * 2); cx.globalAlpha = 1; }
    }
    // 무한: 떨어지는 코인 주머니 (누르기)
    for (const b of g.bags || []) { this.world(); const t0 = this.fx.time; cx.globalAlpha = 0.9; const gl = this.projSprites.glowGold; cx.drawImage(gl.c, b.x - 34, b.y - 34, 68, 68); cx.globalAlpha = 1; cx.font = `30px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('', b.x, b.y + Math.sin(t0 * 6 + b.id) * 3); }
    // 정원식 결혼정보회사: 분홍 점선 원
    if (g.tauntZone) { const z = g.tauntZone; this.world(); cx.globalAlpha = 0.35 + Math.sin(this.fx.time * 6) * 0.1; cx.strokeStyle = '#ff7ac8'; cx.lineWidth = 3; cx.setLineDash([10, 8]); cx.beginPath(); cx.arc(z.x, z.y, z.r, 0, TAU); cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1; }
    // 이한나 하트 레이저 풀파워: 굵은 분홍 빔
    for (const q of g.hbeams || []) {
      this.world();
      const f = q.t / 0.6, ex = q.x + Math.cos(q.a) * q.len, ey = q.y + Math.sin(q.a) * q.len;
      cx.lineCap = 'round';
      cx.globalAlpha = 0.35 * f; cx.strokeStyle = '#ff5fb8'; cx.lineWidth = q.hw * 2.2; cx.beginPath(); cx.moveTo(q.x, q.y); cx.lineTo(ex, ey); cx.stroke();
      cx.globalAlpha = 0.9 * f; cx.strokeStyle = '#ffd6ef'; cx.lineWidth = q.hw * 0.8; cx.beginPath(); cx.moveTo(q.x, q.y); cx.lineTo(ex, ey); cx.stroke();
      cx.globalAlpha = 1;
    }
    // 백인규 할리: 타이어 자국(희미해짐) · 배기 불꽃 · 연기 · 커다란 할리
    for (const q of g.harleys || []) {
      const cx0 = Math.cos(q.a), cy0 = Math.sin(q.a);
      this.world();
      cx.globalAlpha = 0.28; cx.strokeStyle = '#1a1208'; cx.lineWidth = 7; cx.lineCap = 'round';
      for (const off of [-14, 14]) { cx.beginPath(); cx.moveTo(q.x0 - cy0 * off, q.y0 + cx0 * off); cx.lineTo(q.x - cy0 * off, q.y + cx0 * off); cx.stroke(); }
      cx.globalAlpha = 0.12; cx.fillStyle = '#ff9a3c';
      cx.beginPath(); cx.moveTo(q.x0 - cy0 * q.hw, q.y0 + cx0 * q.hw); cx.lineTo(q.x - cy0 * q.hw, q.y + cx0 * q.hw); cx.lineTo(q.x + cy0 * q.hw, q.y - cx0 * q.hw); cx.lineTo(q.x0 + cy0 * q.hw, q.y0 - cx0 * q.hw); cx.closePath(); cx.fill();
      cx.globalAlpha = 1;
      if (Math.random() < 0.6) this.fx.part('flame', q.x - cx0 * 40 + (Math.random() - 0.5) * 10, q.y - cy0 * 40, -cx0 * 60, -cy0 * 60, 0.35, 10, null);
      if (Math.random() < 0.5) this.fx.part('puff', q.x - cx0 * 50, q.y - cy0 * 50, (Math.random() - 0.5) * 30, 20, 0.8, 12, 'rgba(90,90,100,0.5)');
      const bike = this.images.ingyuBike;
      const sz = 150;
      this.tf(q.x, q.y, 0, cx0 < 0 ? -1 : 1, 1);
      if (imgOk(bike)) cx.drawImage(bike, -sz / 2, -sz * 0.75, sz, sz);
      else { cx.font = `${sz * 0.6}px ${FONT}`; cx.textAlign = 'center'; cx.fillText('', 0, -sz * 0.2); }
    }
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
      // 토 웅덩이: 울퉁불퉁한 덩어리 · 진한 테두리 · 번들거림 · 건더기 · 가끔 보글
      const sd = q.x * 0.37 + q.r, grow = Math.min(1, (q.max - q.t) / 0.25 + 0.4), R0 = q.r * grow;
      const lobes = (k) => { cx.beginPath(); cx.arc(0, 0, R0 * 0.72 * k, 0, TAU); for (let i = 0; i < 6; i++) { const an = i * 1.05 + sd, d = R0 * (0.42 + 0.14 * Math.sin(sd * 3 + i * 2.1)); cx.moveTo(Math.cos(an) * d + R0 * 0.38 * k, Math.sin(an) * d); cx.arc(Math.cos(an) * d, Math.sin(an) * d, R0 * 0.38 * k, 0, TAU); } };
      cx.globalAlpha = 0.75 * a; cx.fillStyle = q.enemy ? '#7f9a22' : '#6f8f1c'; lobes(1.08); cx.fill();
      cx.fillStyle = q.enemy ? '#c9d84a' : '#b5cf3a'; lobes(0.96); cx.fill();
      cx.globalAlpha = 0.5 * a; cx.fillStyle = '#eef79a'; cx.beginPath(); cx.ellipse(-R0 * 0.2, -R0 * 0.22, R0 * 0.32, R0 * 0.14, -0.3, 0, TAU); cx.fill();
      cx.globalAlpha = 0.8 * a; cx.fillStyle = '#e6b84a';
      for (let i = 0; i < 5; i++) { cx.beginPath(); cx.arc(Math.cos(i * 2.4 + sd) * R0 * 0.45, Math.sin(i * 1.9 + sd) * R0 * 0.4, 2.5 + (i % 2) * 1.5, 0, TAU); cx.fill(); }
      const bt = (t * 1.3 + sd) % 1; cx.globalAlpha = 0.7 * a * (1 - bt); cx.strokeStyle = '#f4ffb0'; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(Math.cos(sd) * R0 * 0.3, Math.sin(sd * 2) * R0 * 0.3, 2 + bt * 5, 0, TAU); cx.stroke();
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
      const arm = this.images.vfx_arm, fist = this.images.vfx_grab;
      if (arm && imgOk(arm)) {
        const x0 = e.x, y0 = e.y - 20, x1 = h.x, y1 = h.y - 30, len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
        const grow = Math.min(1, (h.grabAge = (h.grabAge || 0) + 1 / 60) / 0.25); // 쭉 뻗어 나간다
        // 처진 곡선 위로 팔 그림을 조각조각 이어 붙인다 (곧은 막대 대신) · 끝은 뻗어 나가는 만큼만
        void ang;
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, sag = len * 0.14 + Math.sin(t * 6) * 3;
        const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1), s0 = ny >= 0 ? 1 : -1;
        const qx = mx + nx * sag * s0, qy = my + Math.abs(ny) * sag + 6;
        const P = (u) => [(1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * qx + u * u * x1, (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * qy + u * u * y1];
        const N = 14, aw = arm.naturalWidth, ah = arm.naturalHeight;
        let ex = x0, ey = y0;
        for (let k = 0; k < N; k++) {
          const u0 = (k / N) * grow, u1 = ((k + 1) / N) * grow;
          const [ax, ay] = P(u0), [bx, by] = P(u1);
          const sl = Math.hypot(bx - ax, by - ay) + 1.2;
          this.tf(ax, ay, Math.atan2(by - ay, bx - ax), 1, 1);
          cx.drawImage(arm, (k / N) * aw, 0, aw / N + 1, ah, 0, -14, sl, 28);
          ex = bx; ey = by;
        }
        if (fist && imgOk(fist) && grow >= 1) { this.tf(x1, y1, Math.sin(t * 10) * 0.1, 1, 1); cx.drawImage(fist, -18, -18, 36, 36); }
        else if (fist && imgOk(fist)) { this.tf(ex, ey, 0, 0.8, 0.8); cx.drawImage(fist, -18, -18, 36, 36); }
        this.world();
        continue;
      }
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
        const x0 = (h.rx !== undefined ? h.rx : h.x) + 4, y0 = h.y - 52, x1 = e.x, y1 = e.y - e.def.size * 0.3;
        const ramp = Math.min(1, h.beamT / 2.5);
        this.world();
        cx.lineCap = 'round'; cx.globalCompositeOperation = 'lighter';
        cx.globalAlpha = 0.22 + ramp * 0.12;
        cx.strokeStyle = '#ff7fd8'; cx.lineWidth = (3 + ramp * 3) * w;
        cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke();
        cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
        const ring = this.images.vfx_winkring;
        if (ring && imgOk(ring) && w === 1) { const nowMs = performance.now(); if (nowMs - (h._ringT || 0) > 460 - ramp * 120) { h._ringT = nowMs; this.vfx('winkring', x0, y0, { anim: 'ring', dur: 620, sz: 70 + ramp * 40, tx: x1, ty: y1, rot: Math.random() * 6 }); } }
        else { const hs = this.projSprites.heart; const k = (t * 1.6 + h.slot * 0.3) % 1; this.tf(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 0, 0.9 + ramp * 0.4, 0.9 + ramp * 0.4); cx.drawImage(hs.c, -8, -8, 16, 16); }
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
      cx.font = `28px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('', fx.fire.x, fy + Math.sin(t * 12) * 1.5);
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
    // 보스 스테이지(x-10): 보스 무대로
    const ar = g.mode === 'stage' && !g.weekly && !g.pvp && !g.raid && g.stage && ((g.stage - 1) % 10) === 9;
    if (ar !== !!this.arenaOn) { this.arenaOn = ar; this.bakeBg(); }
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

  // 멤버 머리 위 상태 딱지 (작은 글씨 · 어두운 바탕)
  stTag(x, y, txt, col) {
    const cx = this.cx;
    cx.save(); this.tf(x, y, 0, 1, 1);
    cx.font = `900 10px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    const w = cx.measureText(txt).width + 10;
    cx.fillStyle = 'rgba(20,10,40,0.82)'; roundRect(cx, -w / 2, -7, w, 14, 7); cx.fill();
    cx.fillStyle = col; cx.fillText(txt, 0, 0.5); cx.restore();
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
  // 쓰러진 진상: 프레임 띠(die)가 있으면 한 번 재생 → 잠깐 누워 있다가 사라짐 · 없으면 코드로 밀려나며 넘어짐
  addCorpse(g, type, x, y, boss) {
    const def = ENEMIES[type];
    if (!def || !this.sprites['e_' + type]) return;
    const cs = this.corpses || (this.corpses = []);
    if (cs.length && cs[0].g !== g) cs.length = 0;
    if (cs.length >= 40) cs.shift();
    cs.push({ g, type, x, y, t0: g.t, boss: !!boss, dir: Math.random() < 0.5 ? -1 : 1 });
  }
  drawCorpses(g) {
    const cs = this.corpses;
    if (!cs || !cs.length) return;
    const cx = this.cx;
    let j = 0;
    for (const c of cs) {
      if (c.g !== g) continue;
      const def = ENEMIES[c.type], box = def.size, a = g.t - c.t0, k = c.boss ? 1.6 : 1;
      const an = ENEMY_ANIM[c.type] && ENEMY_ANIM[c.type].die, strip = an && this.images[`anim_${c.type}_die`];
      const useStrip = strip && imgOk(strip);
      const n = useStrip ? an.frames || Math.max(1, Math.round(strip.naturalWidth / strip.naturalHeight)) : 0;
      const play = useStrip ? n / (an.fps || 14) : 0.37 * k;
      const hold = useStrip ? an.hold || 0.15 : 0.15 * k;
      const fade = 0.5 * k;
      if (a > play + hold + fade) continue;
      cs[j++] = c;
      const alpha = a < play + hold ? 1 : 1 - (a - play - hold) / fade;
      const feet = c.y + box * FEET_OFF;
      cx.globalAlpha = Math.max(0, alpha);
      if (useStrip) {
        const fw = strip.naturalWidth / n, fi = Math.min(n - 1, Math.floor(a * (an.fps || 14)));
        const idle = this.sprites['e_' + c.type], fit = idle && idle.c ? this.stripFit('ed_' + c.type, strip, n, idle.c, 1) : { k: 1, dx: 0, dy: 0 };
        this.tf(c.x, feet, 0, c.dir, 1);
        cx.drawImage(strip, fi * fw, 0, fw, strip.naturalHeight, -box / 2 + fit.dx * box, -box * FEET + fit.dy * box, box * fit.k, box * fit.k);
      } else {
        const sp = this.sprites['e_' + c.type];
        const slide = Math.min(1, a / 0.12) * 8 * k; // 뒤로 살짝 밀려나고
        const f = Math.min(1, Math.max(0, (a - 0.12) / (0.25 * k))); // 0.25초 동안 넘어진다
        const ease = 1 - (1 - f) * (1 - f);
        const rot = c.dir * ease * 1.4, sq = 1 - ease * 0.12;
        this.tf(c.x + c.dir * ease * box * 0.12, feet - slide, rot, 1 + ease * 0.05, sq);
        cx.drawImage(c.boss && a < 0.2 ? sp.f : sp.c, -box / 2, -box * FEET, box, box);
      }
      if (alpha < 1 && Math.random() < 0.15) this.fx.part('puff', c.x + (Math.random() - 0.5) * box * 0.5, feet - 8, 0, -30, 0.5, 6, 'rgba(230,220,255,0.5)');
    }
    cs.length = j;
    cx.globalAlpha = 1;
    this.world();
  }
  drawEnemies(g, t, front) {
    const cx = this.cx;
    if (!front) this.drawCorpses(g);
    const list = this.sorted;
    list.length = 0;
    const striking = (e) => e.atRope && e.stunT <= 0 && (e.hitT > 0 || (e.atkCd > 0 && e.atkCd < 0.3)); // 입구를 때리는 중: 바리케이드 앞에 그린다
    const dark = g.darkT > 0 ? g.rowY - (g.mapFx.seeR || 190) : -1e9;
    for (const e of g.enemies) if (!e.dead && !e.r2 && (e.y > dark || e === g.focus) && (front ? striking(e) : !striking(e))) list.push(e); // (건물주 레이드 보스는 raid2-ui 가 따로 그린다)
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
      const baseKey = key;
      if (e.bai) {
        const vk = e.bwind > 0 || e.windup > 0 ? `e_${e.type}_skill` : e.bai.p2 ? `e_${e.type}_rage` : '';
        const okv = vk && imgOk(this.images[vk]) && this.sprites[vk];
        const dtb = Math.min(0.1, Math.max(0, t - (e._skt || t))); e._skt = t;
        if (okv) { key = vk; e._lvk = vk; }
        e._skb = Math.max(0, Math.min(1, (e._skb || 0) + (okv ? 1 : -1) * dtb * 6)); // 0.17초에 걸쳐 섞기
      }
      const box = def.size;
      let sp = this.sprites[key] || this.sprites['e_' + e.type];
      // 중간 보스: 각성 = 원래 그림을 크게 · 합체 = 두 그림 나란히
      const one = def.fuse && this.sprites[`e_${e.type}_one`];
      const fz = one ? null : def.fuse;
      if (one) sp = one;
      if (def.mid && def.base) sp = this.sprites['e_' + def.base] || sp;
      if (!sp) continue;
      const feet = e.y + box * FEET_OFF;
      const moving = !e.atRope && e.stunT <= 0 && e.windup <= 0 && !(e.bwind > 0) && !(e.castW > 0);
      const w = e.age * (4 + e.speed * 0.09) + e.phase;
      let bob = 0, rot = 0, sx = 1, sy = 1;
      if (moving) {
        bob = -Math.abs(Math.sin(w)) * box * 0.07;
        rot = Math.sin(w) * (def.zigzag ? 0.2 : 0.07);
        sy = 1 - Math.abs(Math.cos(w)) * 0.05;
        sx = 1 / sy;
      } else if (e.atRope && e.stunT <= 0) {
        // 입구 공격 동작: 준비(때리기 0.3초 전부터 뒤로 젖힘) → 때림(입구 쪽으로 · 불꽃) → 반동
        const M = ATK_MOVES[ENEMY_ATK[e.type] || (def.cls === 'violent' ? 'punch' : def.cls === 'seduce' ? 'slap' : def.cls === 'politic' ? 'bag' : 'shove')] || ATK_MOVES.shove;
        const side = e.phase > 3 ? 1 : -1, wind = 0.3;
        if (e.hitT > 0) { const k = 1 - e.hitT / 0.25; const q = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65; bob = q * M.lunge - (1 - q) * M.back * 0.2; rot = q * M.hitRot * side; sy = 1 - q * M.sq; sx = 1 + q * M.sq * 0.8; if (!e._spk) { e._spk = true; this.addDoorHit(e.x, g.ropeY + 6, ENEMY_ATK[e.type]); } }
        else if (e.atkCd > 0 && e.atkCd < wind) { e._spk = false; const q = 1 - e.atkCd / wind; bob = -q * M.back; rot = q * M.rot * side; sy = 1 + q * 0.04; sx = 1 - q * 0.03; }
        else { e._spk = false; sy = 1 + Math.sin(t * 3 + e.phase) * 0.02; }
      } else {
        sy = 1 + Math.sin(t * 3 + e.phase) * 0.02;
      }
      if (e.castW > 0 && !(e.bwind > 0) && !(e.windup > 0)) { const q = Math.min(1, 1 - e.castW / 0.9); bob = -4 - q * 6; rot = -0.12 - q * 0.2 + Math.sin(t * 50) * 0.02 * q; sy = 1 + q * 0.06; sx = 1 - q * 0.04; } // (10/08) 던지기 예고: 몸을 뒤로 젖히고 부들
      if (e.windup > 0 || e.bwind > 0) { sy = 0.82; sx = 1.14; bob = 0; rot = Math.sin(t * 60) * 0.03; if (e.bwind > 0 && Math.sin(t * 40) > 0.6) { this.tf(e.x, e.y - box * 0.3, 0, 1, 1); const gl = this.projSprites.glowRed; cx.drawImage(gl.c, -box * 0.6, -box * 0.6, box * 1.2, box * 1.2); } }
      if (e.kbv < -30) rot -= Math.min(0.5, -e.kbv * 0.0012) * (e.phase > 3 ? 1 : -1);
      if (e.stunT > 0) rot = Math.sin(t * 9 + e.phase) * 0.15;
      const dancing = e.danceT > 0 && e.stunT > 0 && g.onemanT > 0;
      if (dancing) { const b = t * 4.4 + e.phase * 0.7, beat = Math.abs(Math.sin(b)); bob = -beat * box * 0.1; rot = Math.sin(b) * 0.22; sy = 1 - (1 - beat) * 0.08; sx = (1 / sy) * (Math.sin(b * 0.25 + e.phase) > 0 ? 1 : -1); } // 강병화 원맨쇼: 박자 맞춰 좌우로 흔들 · 통통 · 가끔 뒤돌기
      const runA = e.fleeing && e.env && !(e.flash > 0) && !(e.tieT > 0) && ENEMY_ANIM[e.type] && ENEMY_ANIM[e.type].run, runS = runA && this.images[`anim_${e.type}_run`]; // 8장 축의금 도둑: 뒤돌아 달아나는 뒷모습 띠
      if (e.fleeing) { if (!(runS && imgOk(runS))) sx = -sx; bob = e.tieT > 0 ? 0 : -Math.abs(Math.sin(e.age * 18)) * 5; }
      if (e.tieT > 0) rot = Math.sin(t * 14 + e.phase) * 0.06; // 묶여서 버둥버둥
      // 보스 발밑 오라
      if (e.warnN > 0) {
        this.world();
        for (let i = 0; i < 3; i++) {
          cx.fillStyle = i < e.warnN ? '#ffd23f' : 'rgba(0,0,0,0.45)';
          cx.strokeStyle = '#1a0b1f'; cx.lineWidth = 1.2;
          cx.beginPath(); cx.rect(e.x - 10 + i * 7, e.y - box * 0.78 - 8, 5, 7); cx.fill(); cx.stroke();
        }
      }
      if (e.speechT > 0) { // 8장 신랑 친구 대표 축사: 금빛 무적 기운
        const gl = this.projSprites.glowGold, r = box * (0.85 + Math.sin(t * 9) * 0.06);
        this.tf(e.x, e.y - box * 0.25, 0, 1, 1); cx.globalAlpha = 0.95; cx.drawImage(gl.c, -r, -r, r * 2, r * 2); cx.globalAlpha = 1;
        if (Math.random() < 0.3) this.fx.part('star', e.x + (Math.random() - 0.5) * box * 0.7, e.y - box * Math.random() * 0.8, 0, -50, 0.7, 7, null);
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
      if (e.cLay > 0) { // 스테이지 조건 '보호막 진상': 발밑에 옅은 고리 하나만 (겹 수는 머리 위 방패 그림 숫자로)
        this.tf(e.x, feet - 1, 0, 1, 0.35);
        cx.strokeStyle = '#9feaff'; cx.lineWidth = 2.5; cx.globalAlpha = 0.5;
        cx.beginPath(); cx.arc(0, 0, box * 0.32, 0, TAU); cx.stroke();
        cx.globalAlpha = 1;
      }
      if (e.cArmor) { // '철갑 진상': 발밑 강철 판
        this.tf(e.x, feet - 1, 0, 1, 0.35);
        cx.strokeStyle = '#c9d2dc'; cx.lineWidth = 4; cx.globalAlpha = 0.8;
        cx.beginPath(); cx.arc(0, 0, box * 0.4, 0, TAU); cx.stroke();
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
        const img = e.flash > 0 ? sp.f : g.hell || g.tower ? this.hellSprite(sp) : sp.c; // 헬 · 진상의 탑: 붉은 빛을 미리 구운 그림 (그리기 1번)
        const hid = e.def.traits && e.def.traits.stealth && !e.unveiled;
        if (hid) cx.globalAlpha = 0.22 + Math.sin(t * 5 + e.phase) * 0.06; // 은신: 흐릿하게
        const pk = def.puke && !e.flash && key === 'e_' + e.type && ENEMY_ANIM[e.type] && ENEMY_ANIM[e.type].puke, pstrip = pk && this.images[`anim_${e.type}_puke`]; // 토하는 인간: 웩 동작 띠 (구부림 → 쏟음 → 입 닦기)
        let pfi = -1;
        if (pstrip && imgOk(pstrip)) {
          const lead = pk.lead || 0.4, rel = pk.release || 3, after = (def.puke.every - e.pukeT) * (pk.fps || 10);
          if (e.pukeT < lead && e.y > g.ropeY - def.puke.reach && g.heroes.length) pfi = Math.min(rel - 1, Math.floor((1 - e.pukeT / lead) * rel)); // 토하기 직전: 몸을 숙이고 꿀렁
          else if (after >= 0 && after < (pk.frames || 8) - rel) pfi = rel + Math.floor(after); // 쏟은 뒤: 웩 → 입 닦기
        }
        const aa = e.atRope && !e.flash && key === 'e_' + e.type && ENEMY_ANIM[e.type] && ENEMY_ANIM[e.type].attack; // 입구 공격 프레임 띠 (있으면)
        const astrip = aa && this.images[`anim_${e.type}_attack`];
        const an = moving && !e.flash && key === 'e_' + e.type && ENEMY_ANIM[e.type] && ENEMY_ANIM[e.type].walk; // 보스 기술·분노 그림이 뜨는 동안은 그 그림
        const strip = an && this.images[`anim_${e.type}_walk`];
        const spA = e.speechT > 0 && !e.flash && ENEMY_ANIM[e.type] && ENEMY_ANIM[e.type].attack, spS = spA && this.images[`anim_${e.type}_attack`]; // 8장 축사: 공격 띠(금빛 테두리 축사 루프)를 계속
        if (runS && imgOk(runS) && key === 'e_' + e.type) {
          const fh = runS.naturalHeight, n = runA.frames || 12, fw = runS.naturalWidth / n;
          const fi = Math.floor(e.age * (runA.fps || 14) + e.phase * 3) % n;
          const idle = this.sprites['e_' + e.type], fit = idle && idle.c ? this.stripFit('er_' + e.type, runS, n, idle.c) : { k: 1, dx: 0, dy: 0 };
          this.tf(e.x, feet + bob, 0, 1, 1);
          cx.drawImage(runS, fi * fw, 0, fw, fh, -box / 2 + fit.dx * box, -box * FEET + fit.dy * box, box * fit.k, box * fit.k);
        } else if (spS && imgOk(spS)) {
          const fh = spS.naturalHeight, n = spA.frames || 8, fw = spS.naturalWidth / n;
          const fi = Math.floor(t * 7) % n;
          const idle = this.sprites['e_' + e.type], fit = idle && idle.c ? this.stripFit('ea_' + e.type, spS, n, idle.c, 1) : { k: 1, dx: 0, dy: 0 };
          this.tf(e.x, feet, 0, 1, 1);
          cx.drawImage(spS, fi * fw, 0, fw, fh, -box / 2 + fit.dx * box, -box * FEET + fit.dy * box, box * fit.k, box * fit.k);
        } else if (e.brkT > 0 && !(e.flash > 0)) cx.drawImage(this.mosaicSprite(sp), -box / 2, -box * FEET, box, box); // 여지원 「모자이크」: 몸 전체를 큰 네모로 깨뜨린 그림 (한 번 구워 두고 재사용 · 띠 대신)
        else if (pfi >= 0) {
          const fh = pstrip.naturalHeight, n = pk.frames || 8, fw = pstrip.naturalWidth / n;
          const idle = this.sprites['e_' + e.type], fit = idle && idle.c ? this.stripFit('ep_' + e.type, pstrip, n, idle.c, 1) : { k: 1, dx: 0, dy: 0 };
          this.tf(e.x, feet, 0, 1, 1);
          cx.drawImage(pstrip, pfi * fw, 0, fw, fh, -box / 2 + fit.dx * box, -box * FEET + fit.dy * box, box * fit.k, box * fit.k);
        } else if (astrip && imgOk(astrip)) {
          const fh = astrip.naturalHeight, n = aa.frames || Math.max(1, Math.round(astrip.naturalWidth / fh)), fw = astrip.naturalWidth / n, rel = Math.min(n - 1, aa.release || 3);
          const fi = e.hitT > 0 ? Math.min(n - 1, rel + Math.floor((1 - e.hitT / 0.25) * (n - rel))) : e.atkCd > 0 && e.atkCd < 0.3 ? Math.floor((1 - e.atkCd / 0.3) * rel) : 0;
          const idle = this.sprites['e_' + e.type], fit = idle && idle.c ? this.stripFit('ea_' + e.type, astrip, n, idle.c, 1) : { k: 1, dx: 0, dy: 0 };
          this.tf(e.x, feet, 0, 1, 1);
          cx.drawImage(astrip, fi * fw, 0, fw, fh, -box / 2 + fit.dx * box, -box * FEET + fit.dy * box, box * fit.k, box * fit.k);
        } else if (strip && imgOk(strip)) { // 프레임 띠 걷기: 코드 들썩임 대신 그림 칸을 넘긴다
          const fh = strip.naturalHeight, n = an.frames || Math.max(1, Math.round(strip.naturalWidth / fh)), fw = strip.naturalWidth / n;
          const fi = Math.floor(e.age * (an.fps || 10) * Math.max(0.6, e.speed / 50) + e.phase * 3) % n;
          const idle = this.sprites['e_' + e.type], fit = idle && idle.c ? this.stripFit('ew_' + e.type, strip, n, idle.c) : { k: 1, dx: 0, dy: 0 };
          this.tf(e.x, feet, 0, 1, 1);
          cx.drawImage(strip, fi * fw, 0, fw, fh, -box / 2 + fit.dx * box, -box * FEET + fit.dy * box, box * fit.k, box * fit.k);
        } else if (e.bai && e._skb > 0.02 && e._skb < 0.98 && this.sprites[baseKey] && this.sprites[e._lvk]) {
          const b0 = e._skb, s0 = this.sprites[baseKey], s1 = this.sprites[e._lvk];
          cx.globalAlpha = 1 - b0; cx.drawImage(e.flash > 0 ? s0.f : s0.c, -box / 2, -box * FEET, box, box);
          cx.globalAlpha = b0; cx.drawImage(e.flash > 0 ? s1.f : s1.c, -box / 2, -box * FEET, box, box);
          cx.globalAlpha = 1;
        } else cx.drawImage(img, -box / 2, -box * FEET, box, box);
        // 기술 준비: 몸에 보스 색 빛 (더하기 섞기로 한 겹 더 — 스티커처럼 얹지 않게)
        if ((e.bwind > 0 || e.windup > 0) && sp.f) { cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.14 + Math.sin(t * 18) * 0.1; cx.drawImage(sp.f, -box / 2, -box * FEET, box, box); cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1; }
        if (hid) cx.globalAlpha = 1;
      }
      if (def.mid) {
        // 이름표
        this.world();
        cx.font = `900 10px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        const lbl = '' + def.name;
        const tw = cx.measureText(lbl).width + 12;
        cx.fillStyle = 'rgba(60,10,80,0.9)'; roundRect(cx, e.x - tw / 2, feet + 2, tw, 14, 7); cx.fill();
        cx.strokeStyle = '#d8a8ff'; cx.lineWidth = 1; cx.stroke();
        cx.fillStyle = '#fff'; cx.fillText(lbl, e.x, feet + 9.5);
      }
      // 상태 아이콘 / 체력바는 회전 없이
      const top = feet - box * 0.86;
      if (e.def.traits) { // 특성 아이콘 (머리 위 작은 동그라미)
        this.world();
        const keys = Object.keys(e.def.traits).filter((k) => TRAITS[k]);
        keys.forEach((k, i) => { const x0 = e.x + box * 0.3 + i * 13, y0 = top - 4; cx.fillStyle = 'rgba(10,6,24,0.8)'; cx.beginPath(); cx.arc(x0, y0, 6.5, 0, TAU); cx.fill(); cx.font = `8px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(TRAITS[k].icon, x0, y0 + 0.5); });
        if (e.pShield > 0) { cx.font = `900 8px ${FONT}`; cx.fillStyle = '#9feaff'; cx.fillText('' + e.pShield, e.x - box * 0.3, top - 4); }
      }
      if (e.cLay > 0) { // 보호막 겹: 머리 위 왼쪽 작은 방패 + 남은 겹 수
        this.world(); const im = this.images.ui2_shield, x0 = e.x - box * 0.3, y0 = top - 6;
        if (imgOk(im)) cx.drawImage(im, x0 - 7, y0 - 7, 14, 14);
        cx.font = `900 9px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = '#e6faff'; cx.strokeStyle = '#06202c'; cx.lineWidth = 2.5;
        cx.strokeText('' + e.cLay, x0 + 7, y0 + 4); cx.fillText('' + e.cLay, x0 + 7, y0 + 4);
      }
      if (e.brkT > 0) { this.world(); const bx = e.x, by = e.y - e.def.size * 1.0 - 4 + Math.sin(t * 9 + e.phase) * 1.2; cx.font = `900 9px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; const tw = cx.measureText('삐-').width + 8; cx.fillStyle = 'rgba(0,0,0,0.92)'; roundRect(cx, bx - tw / 2, by - 6, tw, 12, 3); cx.fill(); cx.fillStyle = '#ff4a6a'; cx.fillRect(bx - tw / 2, by + 5, tw * Math.min(1, e.brkT / 5), 1.5); cx.fillStyle = '#fff'; cx.fillText('삐-', bx, by + 0.5); } // 여지원 「모자이크」: 머리 위 검은 "삐-" 딱지 (아래 붉은 줄 = 남은 시간)
      if (e.orderT > 0) { this.world(); const ox = e.x, oy = e.y - e.def.size * 1.0 - 14 + Math.sin(t * 8 + e.phase) * 1.2; cx.font = `900 9px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; const tw = cx.measureText('지목').width + 10; cx.fillStyle = 'rgba(120,70,0,0.92)'; roundRect(cx, ox - tw / 2, oy - 6, tw, 12, 4); cx.fill(); cx.fillStyle = '#ffd23f'; cx.fillRect(ox - tw / 2, oy + 5, tw * Math.min(1, e.orderT / 3), 1.5); cx.fillStyle = '#fff6c8'; cx.fillText('지목', ox, oy + 0.5); } // 방장 지목: 모두에게 더 아프게
      if (e.shredN > 0 && e.shredT > 0) { this.world(); cx.font = `900 9px ${FONT}`; cx.textAlign = 'center'; cx.fillStyle = '#ff5a7a'; cx.strokeStyle = '#000'; cx.lineWidth = 2.5; const tx = `방깎×${e.shredN}`; cx.strokeText(tx, e.x, feet + 8); cx.fillText(tx, e.x, feet + 8); }
      if (e.tauntT > 0) { this.world(); cx.font = `11px ${FONT}`; cx.textAlign = 'center'; cx.fillText('', e.x - box * 0.32, top + 2); }
      const vip = e.boss || e.mid || e.elite;
      if (e.slowT > 0 && (!heavy || vip)) { // 진상이 많을 땐 표시를 줄인다
        this.tf(e.x, feet, 0, 1, 0.35);
        cx.strokeStyle = 'rgba(120,200,255,0.85)'; cx.lineWidth = 3;
        cx.beginPath(); cx.arc(0, 0, box * 0.3, 0, TAU); cx.stroke();
      }
      if ((e.stunT > 0 || e.windup > 0) && (!heavy || vip || e.windup > 0) && !dancing) { // (춤추는 진상은 기절 별 대신 음표 · skillfx.js)
        const st = this.projSprites.star;
        for (let i = 0; i < 3; i++) {
          const a = t * 5 + i * TAU / 3;
          this.tf(e.x + Math.cos(a) * box * 0.22, top + Math.sin(a) * 4, a, 0.8, 0.8);
          cx.drawImage(st.c, -8, -8, 16, 16);
        }
      }
      if (e.tieT > 0) { // 8장 임수빈 부케 리본: 몸을 감은 분홍 리본 두 줄 + 나비 매듭
        this.tf(e.x, feet - box * 0.42, 0, 1, 1);
        cx.strokeStyle = '#ff7fbf'; cx.lineWidth = 3; cx.globalAlpha = 0.95;
        for (const k of [-0.12, 0.08]) { cx.beginPath(); cx.ellipse(0, box * k, box * 0.27, box * 0.08, 0.15, 0, TAU); cx.stroke(); }
        cx.fillStyle = '#ff9fd0'; cx.strokeStyle = '#a0306a'; cx.lineWidth = 1.2;
        for (const sd of [-1, 1]) { cx.beginPath(); cx.moveTo(box * 0.24, box * 0.08); cx.lineTo(box * 0.24 + sd * 9, box * 0.08 - 6); cx.lineTo(box * 0.24 + sd * 9, box * 0.08 + 6); cx.closePath(); cx.fill(); cx.stroke(); }
        cx.globalAlpha = 1;
      }
      if (e.fleeing && e.env) { // 8장 축의금 도둑: 머리 위 흰 봉투(빨간 도장) + 붉은 꼬리
        this.tf(e.x, top - 8 + Math.sin(t * 12) * 2, Math.sin(t * 6) * 0.12, 1, 1);
        cx.fillStyle = '#ffffff'; cx.strokeStyle = '#3a1020'; cx.lineWidth = 1.6;
        roundRect(cx, -11, -7, 22, 14, 2); cx.fill(); cx.stroke();
        cx.beginPath(); cx.moveTo(-11, -7); cx.lineTo(0, 1); cx.lineTo(11, -7); cx.stroke();
        cx.fillStyle = '#e02040'; cx.beginPath(); cx.arc(0, 2, 3, 0, TAU); cx.fill();
        if (!(e.tieT > 0) && Math.random() < 0.6) this.fx.part('dot', e.x + (Math.random() - 0.5) * 14, feet - 6, (Math.random() - 0.5) * 20, 30, 0.5, 5, 'rgba(255,40,60,0.75)');
      } else if (e.fleeing) {
        const gs = this.projSprites.gem;
        this.tf(e.x, top - 4 + Math.sin(t * 12) * 2, 0, 1.1, 1.1);
        cx.drawImage(gs.c, -gs.w / 2, -gs.h / 2, gs.w, gs.h);
      }
      if (e.speechT > 0 && e.speechNeed > 0) { // 축사 게이지: 다 채우면 끊긴다
        this.world();
        const bw = 92, bx = e.x - bw / 2, by = top - 26, f = Math.min(1, e.speechG / e.speechNeed);
        cx.fillStyle = 'rgba(20,12,0,0.85)'; roundRect(cx, bx - 2, by - 2, bw + 4, 12, 5); cx.fill();
        cx.fillStyle = '#ffd23f'; roundRect(cx, bx, by, Math.max(2, bw * f), 8, 4); cx.fill();
        cx.font = `900 10px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.lineWidth = 3; cx.strokeStyle = '#000'; cx.fillStyle = '#fff6c8';
        const tx = `축사를 끊어라! ${Math.floor(f * 100)}%`; cx.strokeText(tx, e.x, by - 9); cx.fillText(tx, e.x, by - 9);
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
        const txt = e.form === 'reveal' ? '!' : e.packN >= 2 ? '' : '▲';
        this.tf(e.x + box * 0.28, top - 2, 0, 1, 1);
        const gl = this.glyph(txt, e.form === 'reveal' ? 20 : 11, e.form === 'reveal' ? '#ffe14d' : e.packN >= 2 ? '#9feaff' : '#ff6b5a');
        cx.drawImage(gl.c, -gl.w / 2, -gl.h / 2, gl.w, gl.h);
      }
      if (!this.quiet && !e.boss && (e.hp < e.maxHp || e.shield > 0)) { // 로비 배경 전투(quiet): 체력 막대 없음
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
    // 간판 "정회원 통과" (네온 · 위험하면 깜빡이고 기울어짐) — 로비 뒤 구경 판에서는 안 그린다 (로비 가운데에 떠 보여서)
    if (!(this.fx && this.fx.noBanner)) {
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
    }
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
    if (!(this.fx && this.fx.noBanner)) {
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
    }
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
    this._skOverlay = () => { // 멤버 위에: 스킬 준비 아이콘 · 누르고 있는 버튼 점선
      this.world();
      for (const h of g.heroes) {
        if (!h.def.skill || h.summon || h.skillCd > 0 || h.gone) continue;
        const ic = this.images['sk_' + h.id]; const hx = h.out && h.px !== undefined ? h.px : h.rx !== undefined ? h.rx : h.x, hy = h.out && h.py !== undefined ? h.py : h.y;
        const bob = Math.sin(t * 3 + h.slot) * 2.5;
        this.tf(hx, hy + 22, 0, 1, 0.34); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.5 + Math.sin(t * 4 + h.slot) * 0.15; const gg = this.projSprites.glowGold; if (gg) cx.drawImage(gg.c, -40, -40, 80, 80); cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
        if (imgOk(ic)) { this.tf(hx, hy - 92 + bob, 0, 1, 1); cx.drawImage(ic, -12, -12, 24, 24); }
      }
      const L0 = ui && ui.skLink;
      if (L0 && L0.h && L0.x !== undefined) {
        const h = L0.h, hx = h.out && h.px !== undefined ? h.px : h.x, hy = (h.out && h.py !== undefined ? h.py : h.y) - 40;
        const k = Math.min(1, (performance.now() - L0.t0) / 180);
        this.world(); cx.save(); cx.setLineDash([5, 6]); cx.lineDashOffset = -t * 40; cx.lineWidth = 3; cx.strokeStyle = 'rgba(255,226,120,0.9)'; cx.globalAlpha = k;
        cx.beginPath(); cx.moveTo(L0.x, L0.y); cx.lineTo(L0.x + (hx - L0.x) * k, L0.y + (hy - L0.y) * k); cx.stroke(); cx.restore();
        this.tf(hx, hy + 62, 0, 1, 0.36); cx.globalAlpha = 0.8; cx.strokeStyle = '#ffe07a'; cx.lineWidth = 5; cx.beginPath(); cx.arc(0, 0, 30 + Math.sin(t * 12) * 5, 0, Math.PI * 2); cx.stroke(); cx.globalAlpha = 1;
      }
      // 찍는 스킬: 조준 원을 멤버에서부터 선으로 잇는다
      const a = ui && ui.aim;
      if (a && a.h && a.x !== undefined) { this.world(); cx.save(); cx.setLineDash([3, 6]); cx.strokeStyle = 'rgba(255,255,255,0.55)'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(a.h.x, a.h.y - 40); cx.lineTo(a.x, a.y); cx.stroke(); cx.restore(); }
    };
    // 강성구 기절 면역 오라: 바닥에 옅은 파란 고리 · 지켜지는 멤버 머리 위 작은 방패
    { const sg = g.heroes.find((h) => h.id === 'sunggu' && !h.gone); if (sg) { this.world(); const R0 = 130; cx.save(); cx.translate(sg.x, sg.y + 16); cx.scale(1, 0.4); cx.globalCompositeOperation = 'lighter'; const gr = cx.createRadialGradient(0, 0, R0 * 0.6, 0, 0, R0); gr.addColorStop(0, 'rgba(90,170,255,0)'); gr.addColorStop(0.85, 'rgba(90,170,255,0.16)'); gr.addColorStop(1, 'rgba(120,200,255,0.35)'); cx.fillStyle = gr; cx.beginPath(); cx.arc(0, 0, R0, 0, Math.PI * 2); cx.fill(); cx.strokeStyle = 'rgba(140,210,255,' + (0.35 + Math.sin(t * 3) * 0.12) + ')'; cx.lineWidth = 2.5; cx.beginPath(); cx.arc(0, 0, R0, 0, Math.PI * 2); cx.stroke(); cx.restore(); cx.globalCompositeOperation = 'source-over';
      const shI = this.ccIcons && this.images.ui2_shield; for (const o of g.heroes) { if (o === sg || Math.hypot(o.x - sg.x, o.y - sg.y) > R0) continue; cx.globalAlpha = 0.75; cx.fillStyle = 'rgba(120,200,255,0.9)'; const x0 = o.x + 14, y0 = o.y - 70; cx.beginPath(); cx.moveTo(x0, y0 - 6); cx.lineTo(x0 + 5, y0 - 3); cx.lineTo(x0 + 4, y0 + 3); cx.lineTo(x0, y0 + 6); cx.lineTo(x0 - 4, y0 + 3); cx.lineTo(x0 - 5, y0 - 3); cx.closePath(); cx.fill(); cx.globalAlpha = 1; void shI; } } }
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
    // 윤정섭 전용 신화: 옆 줄 그림자 정섭 (반투명 · 분홍 빛) — 진짜 정섭과 같은 뒷모습 걷기 그림
    for (const tw of g.twins || []) {
      const S0 = (tw.def.scale || 1) * (tw.growT > 0 ? tw.def.skill.grow : 1), bw = box * S0, feet = tw.py + box * FEET_OFF;
      const im = tw.wallSt === 'back' ? this.images.js_walk : this.images.js_walkb;
      const gl = this.projSprites.glowPink || this.projSprites.glowGold;
      this.tf(tw.px, feet - 2, 0, 1, 0.35); cx.globalAlpha = 0.6; cx.drawImage(gl.c, -40, -40, 80, 80);
      if (imgOk(im)) { const n = 8, fw = im.naturalWidth / n, fi = Math.floor(t * 5 + 3) % n; this.tf(tw.px, feet, 0, 1, 1); cx.globalAlpha = 0.72; cx.drawImage(im, fi * fw, 0, fw, im.naturalHeight, -bw / 2, -bw * FEET, bw, bw); }
      cx.globalAlpha = 1;
    }
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
      if (h.awake >= 3) this.drawAwake(h, hx, feet, box, t); // 진상의 탑 60층 지옥 각성: 붉은 오라
      this.tf(hx, feet, 0, 1, 1);
      cx.drawImage(sh.c, -26, -7, 52, 14);
      const up = h.rage || h.upT > 0;
      // 배현경 변신: 주사기가 꽂히는 순간(0.33초 뒤 · 연기 속)에 날씬으로 바뀐다 · 요요는 바로 (skillfx.js diet · yoyo)
      let hgK = 1, alt = h.alt;
      if (h.id === 'hyungyeong') {
        if (h._hgAlt !== h.alt) { if (h._hgAlt !== undefined) h._hgTfAt = performance.now(); h._hgAlt = h.alt; }
        const ms = h._hgTfAt ? performance.now() - h._hgTfAt - (h.alt ? 330 : 0) : 1e9;
        if (ms < 0) alt = false; else hgK = Math.min(1, ms / 560);
      }
      const key = alt && this.sprites['h_' + h.id + '_alt'] ? 'h_' + h.id + '_alt' : up && this.sprites['h_' + h.id + '_rage'] ? 'h_' + h.id + '_rage' : 'h_' + h.id;
      const sp = this.sprites[key];
      if (!sp) continue;
      let bob = Math.sin(t * 3 + h.slot) * 1.2, rot = 0, sx = 1, sy = 1;
      if (h.id === 'donghan' && !up) bob -= 12; // 누운 문동한: 스킬 버튼 줄에 가리지 않게
      if (h.recoil > 0) { const p = h.recoil / 0.14; sy = 1 + p * 0.07; sx = 1 - p * 0.05; bob -= p * 3; }
      if (h.rage) { rot = Math.sin(t * 24) * 0.05; bob += Math.sin(t * 30) * 1.5; }
      if (h.charmT > 0) { rot = Math.sin(t * 4) * 0.14; }
      if (h.stunT > 0) { rot = Math.sin(t * 10) * 0.1; sy = 0.94; }
      if (h.kdT > 0) { const k = Math.min(1, (h.kdSec - h.kdT) / 0.25, h.kdT / 0.35); rot = (hx < 180 ? -1 : 1) * 1.3 * k; sy = 1 - 0.1 * k; bob += 14 * k; } // 쓰러짐: 옆으로 픽 누움 (일어날 때 다시 세움)
      if (h.joinT < 0.4) { const p = h.joinT / 0.4; const e = 1 + Math.sin(p * Math.PI) * 0.3; if (g.joinMode) { bob += (1 - p) * 70; sx *= 0.6 + 0.4 * p; sy *= 0.6 + 0.4 * p * e; } else { sx *= e * p; sy *= e * p; } } // 합류: 아래에서 미끄러져 올라온다
      if (h.id === 'sunggu' || (h.id === 'ara' && h.alt)) rot += Math.sin(t * 1.5) * 0.04; // 할아버지 · 늙은 공주 휘청
      sy *= 1 + Math.sin(t * 2.2 + h.slot * 1.7) * 0.012; // 숨쉬기
      if (h.reloadT > 0 && h.reloadMax > 0.25) { const q = 1 - h.reloadT / h.reloadMax; rot += Math.sin(q * Math.PI) * -0.13; bob += Math.sin(q * Math.PI) * 1.5; } // 장전: 살짝 기울여 챙기기
      if (h.id === 'hyungyeong' && alt) bob += Math.sin(t * 22) * 1.6; // 날씬 복서 스텝
      if (hgK < 1) { const w = Math.sin(hgK * Math.PI * 3) * (1 - hgK) * (1 - hgK); if (alt) { sx *= 1 - 0.3 * w; sy *= 1 + 0.32 * w; } else { sx *= 1 + 0.34 * w; sy *= 1 - 0.24 * w; } } // 변신 순간 말랑: 날씬 = 쭉 늘었다 출렁 · 통통 = 옆으로 빵빵 부풀었다 출렁
      // 공격 리듬: 준비(다음 공격 직전 뒤로 젖힘·들어 올리기) → 던짐(반동) — 멤버마다 다르게
      const wk = WEAPON[h.id] ? WEAPON[h.id].kind : '';
      const C = CADENCE[h.id] || CADENCE['_' + wk] || CADENCE._default;
      const busy = h.stunT > 0 || h.charmT > 0 || h.grabT > 0 || h.kdT > 0;
      if (!busy && h.cd > 0 && h.cd < C.wind && !(h.reloadT > 0)) { const q = 1 - h.cd / C.wind; rot -= q * C.back * (hx < 180 ? 1 : -1) * 0.8; sy *= 1 - q * C.sq; sx *= 1 + q * C.sq * 0.6; bob -= q * (C.lift || 0); if (C.nod) rot += Math.sin(q * Math.PI) * 0.08; }
      const since = g.t - (h.lastShotT || -9);
      if (since < 0.22) { const q = 1 - since / 0.22; rot += q * C.snap * (hx < 180 ? 1 : -1) * 0.5; bob += q * 2; }
      let dx = 0;
      if (h._hitAt) { const hk = (performance.now() - h._hitAt) / 260; if (hk < 1) { const sp0 = Math.cos(hk * Math.PI * 2.5) * (1 - hk); sy *= 1 - 0.1 * sp0; sx *= 1 + 0.06 * sp0; bob += 8 * (1 - hk) * (1 - hk); } }
      if (C.move && !busy) { // 코드 모션 (프레임 띠가 없는 멤버)
        const side = hx < 180 ? 1 : -1;
        const q = h.cd > 0 && h.cd < C.wind && !(h.reloadT > 0) ? 1 - h.cd / C.wind : 0; // 준비
        const s = since < 0.3 ? 1 - since / 0.3 : 0, e = s * s; // 던진 뒤 (빨리 → 천천히 제자리)
        switch (C.move) {
          case 'wag': rot += Math.sin(q * Math.PI * 4) * 0.09 * q; bob -= e * 5; sy *= 1 + e * 0.05; break;
          case 'toss': sy *= 1 - q * 0.06; bob += q * 2 - e * 9; sx *= 1 - e * 0.04; sy *= 1 + e * 0.06; break;
          case 'swig': rot -= q * 0.12 * side; bob -= q * 3; rot += e * 0.22 * side; dx += e * 4 * side; break;
          case 'wink': rot += q * 0.1 * side; dx -= q * 4 * side; { const pp = 1 + e * 0.08; sx *= pp; sy *= pp; } break;
          case 'jab': sy *= 1 - q * 0.05; bob += q * 3 - e * 12; dx += Math.sin(since * 40) * e * 3; break;
          case 'cast': bob -= q * 9 + e * 4; { const pp = 1 + e * 0.1 * Math.sin(Math.min(1, since / 0.12) * Math.PI); sx *= pp; sy *= pp; } break;
          case 'pop': sy *= 1 - q * 0.12; sx *= 1 + q * 0.06; bob += q * 3 - e * 11; sy *= 1 + e * 0.1; sx *= 1 - e * 0.05; break;
          case 'cheer': rot += Math.sin(q * Math.PI * 6) * 0.11 * q; bob -= q * 4; dx -= q * 3 * side; rot -= e * 0.2 * side; dx += e * 7 * side; bob -= e * 9; { const pp = 1 + e * 0.07; sx *= pp; sy *= pp; } break; // 송바울: 응원봉 흔들흔들 → 휙 던지고 윙크 점프
        }
      }
      // 기진맥진: 주저앉기 · 느린 숨 · 땀 · 어지러운 소용돌이
      if (h.tiredT > 0) { const k = Math.min(1, h.tiredT / 1.2); sy *= 1 - 0.08 * k; sx *= 1 + 0.04 * k; bob += 3 * k; rot += Math.sin(t * 1.4 + h.slot) * 0.05 * k; }
      // 프레임 띠 (있으면): 준비 = 0~release-1 칸 · 던진 뒤 0.3초 = release~끝 칸
      const cp = this.kit && !busy ? this.kit.castPose(h) : null; // 대개편: 스킬 시전 동작 (멤버마다 다른 몸짓)
      if (cp) { dx += cp.dx; bob += cp.dy; rot += cp.rot; sx *= cp.sx; sy *= cp.sy; }
      const formOn = !!HERO_ANIM_FORM[h.id] && (h.id === 'ingyu' ? (g.harleys || []).some((q) => q.hero === h) : (h.id === 'eunok' || h.id === 'donghan') ? !!up : h.id === 'youngjun' ? !!h.out : !!alt);
      const HA = formOn ? HERO_ANIM_FORM[h.id] : HERO_ANIM[h.id], hstrip = HA && this.images[formOn ? 'hanim_' + h.id + '_f' : 'hanim_' + h.id];
      let usedStrip = false;
      if (h.id === 'baul' && h.bd && !busy) usedStrip = this.drawBaul(g, h, hx, feet, box, sp, t);
      if (h.id === 'junyoung' && h.out && !busy) usedStrip = this.drawJunyoung(g, h, hx, feet, box, sp, t);
      if (h.id === 'donghan' && h.ssjT > 0 && this.sprites.h_donghan_ssj) { // 문동한 초사이언 포격: 변신 띠 → 한 발마다 포격 띠 (두 손 모아 기 모으기 → 가리키는 칸에 발사) · 사이엔 금빛 모습
        const sk = h.def.skill, q = h.ssj, ssp = this.sprites.h_donghan_ssj, tfI = this.images.dh_ssj_tf, ca = this.images.dh_ssj_cast;
        let im = null, key = '', fi = 0;
        if (q && q.t < sk.wind && imgOk(tfI)) { im = tfI; key = 'dh_ssj_tf'; fi = Math.min(7, Math.floor((q.t / sk.wind) * 8)); }
        else if (q && !busy && imgOk(ca) && (q.left > 0 || since < 0.3)) { const p = Math.max(0, since) / sk.gap; im = ca; key = 'dh_ssj_cast'; fi = q.left > 0 ? Math.floor(((p + 5 / 8) % 1) * 8) : Math.min(7, 5 + Math.floor((since / 0.3) * 3)); }
        const shake = q && q.t >= sk.wind * 0.35 && q.t < sk.wind ? Math.sin(t * 70) * 1.6 : 0; // 기합 넣는 동안 부들부들
        if (im) { const fit = this.stripFit(key, im, 8, ssp.c), fw = im.naturalWidth / 8; this.tf(hx + shake, feet, 0, 1, 1); cx.drawImage(im, fi * fw, 0, fw, im.naturalHeight, -box / 2 + fit.dx * box, -box * FEET + fit.dy * box, box * fit.k, box * fit.k); }
        else { this.tf(hx + shake, feet + Math.sin(t * 6) * 1.2, 0, 1, 1 + Math.sin(t * 9) * 0.012); cx.drawImage(ssp.c, -box / 2, -box * FEET, box, box); }
        usedStrip = true;
      }
      if (h.id === 'youngjun' && h.out) { // 김영준: 진상에 붙으면 달리는 모습 대신 싸우는 자세(발톱 베기 띠) · 진상 쪽을 본다 · 한 대마다 앞으로 톡
        const tg = h.dashE, im = this.images.hanim_youngjun;
        if (h.shots !== h._ysShots) { if (h._ysShots !== undefined && tg && !tg.dead) { h._ysAt = performance.now(); if (this.skfx) this.skfx.ysStrike(h, tg); } h._ysShots = h.shots; }
        const near = tg && !tg.dead && Math.hypot(tg.x - h.px, tg.y - h.py) < (h.def.reach || 70) + (tg.r || 14) + 12;
        if (tg && !tg.dead) h._ysFace = tg.x < h.px - 2 ? -1 : tg.x > h.px + 2 ? 1 : h._ysFace || 1;
        if (near && imgOk(im)) {
          const s2 = (performance.now() - (h._ysAt || 0)) / 1000, face = h._ysFace || 1;
          const fi = s2 < 0.13 ? 3 + Math.min(2, Math.floor((s2 / 0.13) * 3)) : 2 - (Math.floor(t * 8) % 2); // 베기 3~5칸 · 사이엔 자세 1~2칸
          const nud = s2 < 0.1 ? (1 - s2 / 0.1) * 5 : 0;
          const fit = this.stripFit('hanim_youngjun', im, 8, sp.c), fw = im.naturalWidth / 8;
          this.tf(hx + face * nud, feet, 0, face, 1);
          cx.drawImage(im, fi * fw, 0, fw, im.naturalHeight, -box / 2 + fit.dx * box, -box * FEET + fit.dy * box, box * fit.k, box * fit.k);
          usedStrip = true;
        }
      }
      if (hstrip && imgOk(hstrip) && !busy && !usedStrip && !cp && (formOn || (!up && !alt)) && !(h.id === 'youngjun' && h.restT > 0) && !(h.id === 'jiwon' && h.mzQ && h.mzQ.length) && !(h.id === 'dohoon' && h._encAt && performance.now() - h._encAt < 1700)) { // (김영준 숨 고르기 · 여지원 폭격 중엔 아래 전용 모습)
        const n = HA.frames, fw = hstrip.naturalWidth / n, fh = hstrip.naturalHeight, rel = HA.release;
        let fi = -1;
        if (since < 0.3) fi = Math.min(n - 1, rel + Math.floor((since / 0.3) * (n - rel)));
        else if (h.cd > 0 && h.cd < Math.max(0.25, C.wind)) fi = Math.floor((1 - h.cd / Math.max(0.25, C.wind)) * rel);
        if (fi >= 0) {
          // 띠 크기·발 위치를 가만히 있는 그림에 맞춘다 (칸마다 크기가 튀지 않게 · 발이 흔들리지 않게)
          const fit = this.stripFit(formOn ? 'hanim_' + h.id + '_f' : 'hanim_' + h.id, hstrip, n, sp.c);
          const bw = box * fit.k;
          this.tf(hx, feet + (h.tiredT > 0 ? 3 : 0), 0, 1, 1);
          cx.drawImage(hstrip, fi * fw, 0, fw, fh, -box / 2 + fit.dx * box, -box * FEET + fit.dy * box, bw, bw);
          usedStrip = true;
        }
      }
      if (h.id === 'dohoon' && !usedStrip && !busy) { // 김도훈: 앵콜 띠 (점프 → 마이크를 관객에게 → 주먹 번쩍) · 평소엔 리듬 타기 띠 (연출 줄이기면 가만히)
        const enc = this.images.dohoon_encore, idl = this.images.dohoon_idle, ek = h._encAt ? (performance.now() - h._encAt) / 1700 : 9;
        let im = null, key = '', fi = 0, lift = 0;
        if (ek < 1 && imgOk(enc)) { im = enc; key = 'dohoon_encore'; fi = Math.min(7, Math.floor(ek * 8)); lift = fi === 2 ? -10 : fi === 1 ? -4 : 0; }
        else if (imgOk(idl) && !(typeof document !== 'undefined' && document.body.classList.contains('rm'))) { im = idl; key = 'dohoon_idle'; fi = Math.floor(t * 6 + h.slot * 3) % 8; }
        if (im) { const fit = this.stripFit(key, im, 8, sp.c, key === 'dohoon_encore' ? 0 : 1), fw = im.naturalWidth / 8; this.tf(hx, feet + lift + (h.tiredT > 0 ? 3 : 0), 0, 1, 1); cx.drawImage(im, fi * fw, 0, fw, im.naturalHeight, -box / 2 + fit.dx * box, -box * FEET + fit.dy * box, box * fit.k, box * fit.k); usedStrip = true; }
      }
      if (h.id === 'wonsik' && h.wsSt && !usedStrip) { // 정원식: 걸어 나감(뒷모습) → 앉아 상담(분홍 하트 고리 · 체력 막대) → 돌아옴(앞모습)
        const px = h.px !== undefined ? h.px : hx, py = (h.py !== undefined ? h.py : h.y) + box * FEET_OFF;
        const wb = this.images.ws_walkb, wf = this.images.ws_walkf, bk = this.images.ws_back, cs = this.images.ws_consult;
        const strip = (im) => { const n = 8, fw = im.naturalWidth / n, fi = Math.floor(t * 7) % n; this.tf(px, py, 0, 1, 1); cx.drawImage(im, fi * fw, 0, fw, im.naturalHeight, -box / 2, -box * FEET, box, box); };
        if (h.wsSt === 'sit') {
          this.world(); cx.save(); cx.translate(px, py); cx.scale(1, 0.38); cx.globalCompositeOperation = 'lighter'; cx.strokeStyle = 'rgba(255,120,190,' + (0.45 + Math.sin(t * 5) * 0.15) + ')'; cx.lineWidth = 5;
          const R0 = h.def.skill.consult.r * 0.55; cx.beginPath(); for (let k = 0; k <= 40; k++) { const a0 = (k / 40) * Math.PI * 2, hr = R0 * (1 - 0.18 * Math.sin(a0) ** 8); const xx = Math.cos(a0) * hr, yy = Math.sin(a0) * hr; if (!k) cx.moveTo(xx, yy); else cx.lineTo(xx, yy); } cx.stroke(); cx.restore(); cx.globalCompositeOperation = 'source-over';
          if (imgOk(cs)) { this.tf(px, py, 0, 1, 1); const bw = box * 1.25; cx.drawImage(cs, -bw / 2, -bw * FEET, bw, bw); }
          const f = Math.max(0, h.wsPool / (h.wsPoolMax || 1)); this.tf(px - 22, py - box * 1.05, 0, 1, 1); cx.fillStyle = 'rgba(10,6,22,0.85)'; cx.fillRect(-1, -1, 46, 7); cx.fillStyle = '#ff8ab8'; cx.fillRect(0, 0, 44 * f, 5);
        } else if (h.wsSt === 'walk') { if (imgOk(wb)) strip(wb); else if (imgOk(bk)) { this.tf(px, py - Math.abs(Math.sin(t * 6)) * 3, 0, 1, 1); cx.drawImage(bk, -box / 2, -box * FEET, box, box); } }
        else { if (imgOk(wf)) strip(wf); else { this.tf(px, py - Math.abs(Math.sin(t * 6)) * 3, 0, 1, 1); cx.drawImage(sp.c, -box / 2, -box * FEET, box, box); } }
        usedStrip = true;
      }
      if (h.id === 'donghan' && !usedStrip && imgOk(this.images.dh_tf)) { // 문동한: 누워 있다가 일어나 커피 한 모금 → 진심 모드 (끝나면 거꾸로 짧게 눕기)
        const tf = this.images.dh_tf, n = 12, fw = tf.naturalWidth / n, wind = h.def.burst ? h.def.burst.windup : 1;
        const nowMs = performance.now();
        if (h.upT > 0) h._wasUp = true; else if (h._wasUp) { h._wasUp = false; h._downAt = nowMs; }
        let fi = -1;
        if (h.burstT > 0) fi = Math.min(n - 1, Math.floor((1 - h.burstT / wind) * n));
        else if (h._downAt && nowMs - h._downAt < 500) fi = Math.max(0, 7 - Math.floor(((nowMs - h._downAt) / 500) * 8));
        if (fi >= 0) { const fit = this.stripFit('dh_tf', tf, n, this.sprites['h_donghan_rage'] ? this.sprites['h_donghan_rage'].c : sp.c); this.tf(hx, feet, 0, 1, 1); cx.drawImage(tf, fi * fw, 0, fw, tf.naturalHeight, -box / 2 + fit.dx * box, -box * FEET + fit.dy * box, box * fit.k, box * fit.k); usedStrip = true; }
      }
      if (h.id === 'hanna' && !usedStrip && imgOk(this.images.hanna_back) && ((h.beamE && !h.beamE.dead) || g.t - (h.lastShotT || -9) < 0.5)) { // 이한나: 쏠 땐 진상 쪽을 보는 뒷모습 · 앞으로 6px 기울고 톡톡 커짐
        const im = this.images.hanna_back, bw = box, ph = (t * 2.2) % 1, pulse = 1 + (ph < 0.18 ? Math.sin((ph / 0.18) * Math.PI) * 0.05 : 0);
        this.tf(hx, feet - 6 * Math.min(1, (h.beamT || 0) * 4), -0.03, pulse, pulse); cx.drawImage(im, -bw / 2, -bw * FEET, bw, bw);
        if (ph < 0.12) { cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 1 - ph / 0.12; const gr = cx.createRadialGradient(bw * 0.08, -bw * 0.72, 0, bw * 0.08, -bw * 0.72, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,140,220,0.8)'); gr.addColorStop(1, 'rgba(255,90,200,0)'); cx.fillStyle = gr; cx.fillRect(bw * 0.08 - 16, -bw * 0.72 - 16, 32, 32); cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over'; } // 눈에서 반짝 (윙크)
        usedStrip = true;
      }
      if (h.id === 'jeongseob' && !usedStrip) { // 윤정섭: 키 1.25배 · 나갈 땐 뒷모습 뚜벅뚜벅(6프레임/초) · 돌아올 땐 앞모습 · 쉴 땐 앉아서 물 마시기
        const S0 = (h.def.scale || 1) * (h.growT > 0 ? h.def.skill.grow : 1), bw = box * S0;
        const wb = this.images.js_walkb, wk = this.images.js_walk, rs0 = this.images.js_rest, bk = this.images.js_back;
        const strip = (im, fps) => { const n = 8, fw = im.naturalWidth / n, fi = Math.floor(t * fps) % n; const step = (t * fps) % 1; this.tf(hx, feet - (step < 0.5 ? step * 4 : (1 - step) * 4), 0, 1, 1); cx.drawImage(im, fi * fw, 0, fw, im.naturalHeight, -bw / 2, -bw * FEET, bw, bw); return fi; };
        if (h.wallSt === 'out' && imgOk(wb)) { const fi = strip(wb, 5); if ((fi === 0 || fi === 4) && h._lastStep !== fi) { h._lastStep = fi; this.onStep && this.onStep(h, hx, feet); } else if (fi !== 0 && fi !== 4) h._lastStep = -1; usedStrip = true; }
        else if (h.wallSt === 'out' && imgOk(bk)) { this.tf(hx, feet, 0, 1, 1); cx.drawImage(bk, -bw / 2, -bw * FEET, bw, bw); usedStrip = true; }
        else if (h.wallSt === 'back' && imgOk(wk)) { strip(wk, 5); usedStrip = true; }
        else if (imgOk(rs0)) { this.tf(hx, feet, 0, 1, 1 + Math.sin(t * 1.6) * 0.01); cx.drawImage(rs0, -bw / 2, -bw * FEET, bw, bw); usedStrip = true; }
      }
      if (h.id === 'jiwon' && !busy && !usedStrip && h.mzQ && h.mzQ.length && imgOk(this.images.hanim_jiwon)) { // 여지원 모자이크 폭격: 손 번쩍 든 칸(0)으로 버티며 몸을 끌어올렸다가 → 내려칠 때마다 내지르는 칸(5~6)
        const q = h.mzQ[0], wind = (h.def.skill && h.def.skill.wind) || 0.6, im = this.images.hanim_jiwon, n = 8, fw = im.naturalWidth / n;
        const slamming = q.t >= wind, ph = slamming ? ((q.t - wind) % ((h.def.skill && h.def.skill.gap) || 0.18)) / 0.18 : 0;
        const fi = slamming ? (ph < 0.5 ? 5 : 6) : 0, k = slamming ? 1 : Math.min(1, q.t / wind);
        const fit = this.stripFit('hanim_jiwon', im, n, sp.c);
        this.tf(hx, feet + (slamming ? Math.sin(ph * Math.PI) * 3 : -k * 6), 0, 1 + (slamming ? 0 : -0.04 * k), 1 + (slamming ? 0 : 0.07 * k));
        cx.drawImage(im, fi * fw, 0, fw, im.naturalHeight, -box / 2 + fit.dx * box, -box * FEET + fit.dy * box, box * fit.k, box * fit.k);
        usedStrip = true;
      }
      if (h.id === 'youngjun' && !h.out && h.restT > 0 && !busy && !usedStrip) { // 김영준 숨 고르기: 자리로 돌아와 크로스핏 (쉬기 띠가 있으면 띠 · 없으면 기본 그림에 스쿼트 점프 모션)
        const rs = this.images.hanim_youngjun_rest;
        if (imgOk(rs)) {
          const n = 8, fw = rs.naturalWidth / n, fi = Math.floor(t * 9) % n, fit = this.stripFit('hanim_youngjun_rest', rs, n, sp.c);
          this.tf(hx, feet, 0, 1, 1); cx.drawImage(rs, fi * fw, 0, fw, rs.naturalHeight, -box / 2 + fit.dx * box, -box * FEET + fit.dy * box, box * fit.k, box * fit.k);
        } else {
          const ph = (t * 1.5 + h.slot * 0.3) % 1; let yb = 0, ksx = 1, ksy = 1; // 0~0.4 쪼그려 앉기 · 0.4~0.7 점프 · 0.7~1 착지
          if (ph < 0.4) { const k = Math.sin((ph / 0.4) * Math.PI * 0.5); ksy = 1 - 0.16 * k; ksx = 1 + 0.08 * k; }
          else if (ph < 0.7) { const k = (ph - 0.4) / 0.3; yb = -Math.sin(k * Math.PI) * 13; ksy = 1.06 - 0.06 * k; ksx = 0.97 + 0.03 * k; }
          else { const k = (ph - 0.7) / 0.3; ksy = 1 - 0.07 * Math.sin(k * Math.PI); ksx = 1 + 0.04 * Math.sin(k * Math.PI); }
          this.tf(hx, feet + yb, 0, ksx, ksy); cx.drawImage(sp.c, -box / 2, -box * FEET, box, box);
        }
        usedStrip = true;
      }
      if (!usedStrip) {
        { const ck = h._castAt && !cp ? (performance.now() - h._castAt) / 250 : 9; if (ck < 1) { const s0 = 1 + Math.sin(ck * Math.PI) * 0.15; this.tf(hx + dx, feet + bob, rot, sx * s0, sy * s0); } else this.tf(hx + dx, feet + bob, rot, sx, sy); } // (시전 동작이 없는 멤버만 톡 커지기)
        cx.globalAlpha = h.stunT > 0 ? 0.75 : 1;
        cx.drawImage(sp.c, -box / 2, -box * FEET, box, box);
        if (h.freezeT > 0 && h.stunT > 0 && sp.f) { cx.globalAlpha = 0.5; cx.drawImage(sp.f, -box / 2, -box * FEET, box, box); } // 7장 빙결: 하얗게 언 모습
        const hk2 = h._hitAt ? (performance.now() - h._hitAt) / 160 : 9;
        if (hk2 < 1 && sp.f) { cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.55 * (1 - hk2); cx.drawImage(sp.f, -box / 2, -box * FEET, box, box); cx.globalCompositeOperation = 'source-over'; }
        cx.globalAlpha = 1;
      }
      if (h.awake >= 3) this.drawAwakeEyes(h, hx, feet, box, t); // 지옥 각성: 빛나는 눈
      if (h.tiredT > 0) { // 땀방울 · 소용돌이
        const top2 = feet - box * 0.95;
        this.world();
        cx.fillStyle = 'rgba(140,210,255,0.95)';
        for (let i = 0; i < 2; i++) { const ph = (t * 1.6 + i * 0.5) % 1; cx.beginPath(); cx.ellipse(hx + (i ? 16 : -14), top2 + 14 + ph * 16, 2.6, 3.8, 0, 0, TAU); cx.fill(); }
        cx.strokeStyle = 'rgba(255,255,255,0.8)'; cx.lineWidth = 1.6; cx.beginPath();
        for (let a = 0; a < TAU * 1.6; a += 0.3) { const r = 2 + a * 1.6; const x = hx + Math.cos(a + t * 5) * r, y = top2 - 4 + Math.sin(a + t * 5) * r * 0.45; if (a === 0) cx.moveTo(x, y); else cx.lineTo(x, y); }
        cx.stroke();
      }
      if (h.id === 'youngjun' && !h.out && h.restT > 0 && h.restMax > 0) { // 숨 고르기: 땀방울 + 머리 위 동그란 회복 게이지 (다 차면 다시 돌격)
        const top2 = feet - box * 0.95, f = Math.max(0, Math.min(1, 1 - h.restT / h.restMax)), gx = hx, gy = top2 - 12;
        this.world();
        cx.fillStyle = 'rgba(140,210,255,0.95)';
        for (let i = 0; i < 2; i++) { const ph = (t * 1.8 + i * 0.5) % 1; cx.globalAlpha = 1 - ph; cx.beginPath(); cx.ellipse(hx + (i ? 17 : -15), top2 + 12 + ph * 18, 2.4, 3.6, 0, 0, TAU); cx.fill(); }
        cx.globalAlpha = 1;
        cx.fillStyle = 'rgba(14,8,30,0.82)'; cx.beginPath(); cx.arc(gx, gy, 11, 0, TAU); cx.fill();
        cx.lineWidth = 3.5; cx.strokeStyle = 'rgba(255,255,255,0.18)'; cx.beginPath(); cx.arc(gx, gy, 8, 0, TAU); cx.stroke();
        cx.strokeStyle = f > 0.85 ? '#7dffb0' : '#b48cff'; cx.lineCap = 'round'; cx.beginPath(); cx.arc(gx, gy, 8, -Math.PI / 2, -Math.PI / 2 + TAU * f); cx.stroke(); cx.lineCap = 'butt';
        cx.fillStyle = '#fff'; cx.font = `900 9px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(Math.ceil(h.restT), gx, gy + 0.5);
      }
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
      if (h.stunT > 0 || h.kdT > 0) {
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

      if (h.paperT > 0) {
        const ps = this.projSprites.paper;
        this.tf(hx - 18, top - 4 + Math.sin(t * 5) * 2, 0.2, 0.6, 0.6);
        cx.drawImage(ps.c, -ps.w / 2, -ps.h / 2, ps.w, ps.h);
      }
      { // 상태 딱지: 머리 위 가운데에 위로 쌓기 (옆 멤버와 안 겹치게)
        const tags = [];
        if (h.kdT > 0) tags.push(['쓰러짐', '#ff8a7a']); // 쓰러짐 게이지가 가득
        if (h.stunT > 0) tags.push(h.freezeT > 0 ? ['빙결', '#bff4ff'] : ['기절', '#ffe27a']);
        if (h.poisonT > 0) tags.push(['독', '#9dff6a']);
        if (h.muteT > 0 && h.silenceT > 0) tags.push(['침묵', '#d0c0ff']); // 7장 펜션 사장님 소음 금지
        if (h.grabT > 0) tags.push(['붙잡힘', '#ff8a8a']);
        if (h.blindT > 0) tags.push(['눈부심', '#fff2a0']);
        if (h.fearT > 0) tags.push(['공포', '#d8a8ff']);
        if (h.drowsyT > 0) tags.push(['졸림', '#b8d0ff']);
        if (h.vomitT > 0) tags.push(['토 밟음', '#c8f08a']);
        if (h.fanT > 0) tags.push(['함성!', '#9fe6ff']); // 송바울 팬클럽 함성
        tags.slice(0, 2).forEach(([txt, col], i) => this.stTag(hx, top - 14 - i * 16, txt, col));
      }
      if (h.heartT > 0) { // 건전녀 응급 방패: 머리 위 하트 방패 (끝날 때쯤 깜빡)
        const hs = this.projSprites.heart, k = h.heartT < 1 ? 0.5 + 0.5 * Math.sin(t * 20) : 1;
        this.tf(hx + 20, top + 2 + Math.sin(t * 3 + h.slot) * 2, 0, 0.9, 0.9);
        cx.globalAlpha = 0.9 * k; cx.drawImage(hs.c, -8, -8, 16, 16); cx.globalAlpha = 1;
      }
      if (g.flirt && h.def.gender === 'm') {
        const hs = this.projSprites.heart;
        this.tf(hx - 18, top + 10 + Math.sin(t * 4 + h.slot) * 3, 0, 0.8, 0.8);
        cx.globalAlpha = 0.85;
        cx.drawImage(hs.c, -8, -8, 16, 16);
        cx.globalAlpha = 1;
      }
      // 발밑 배지: 이름은 안 쓴다 (눌러서 보기) — [속성] Lv칩 · 게스트는 G 리본 (다른 디펜스 게임들처럼)
      this.world();
      {
        const ly = feet + 9, at = ATTRS[h.def.attr];
        const lvT = (h._skNo ? h._skNo + ' · ' : '') + (h.lv >= 5 ? 'MAX' : 'Lv' + h.lv);
        const rfk = this.rallyFlashAt ? (performance.now() - this.rallyFlashAt - h.slot * 30) / 260 : 9; const rallyTag = rfk > 0 && rfk < 1;
        cx.textBaseline = 'middle'; cx.textAlign = 'center';
        cx.font = `800 8px ${FONT}`;
        const tw = cx.measureText(lvT).width, pw = tw + 20, ph = 13, px = hx - pw / 2;
        cx.fillStyle = rallyTag ? 'rgba(255,200,40,0.95)' : 'rgba(12,10,28,0.88)';
        roundRect(cx, px, ly - ph / 2, pw, ph, ph / 2); cx.fill();
        if (g.leader === 'bangjang' && g.heroes.some((o) => o.id === 'bangjang')) { cx.fillStyle = '#ffd23f'; cx.beginPath(); cx.arc(px + pw - 2, ly - ph / 2 + 1, 2.6, 0, Math.PI * 2); cx.fill(); } // 방장이 대장: 모두 공속 +
        cx.strokeStyle = h.lv >= 5 ? '#ffb347' : 'rgba(255,214,110,0.45)'; cx.lineWidth = 1; cx.stroke(); // 색깔 테두리 없이 (사용자 요청) · 금빛 한 가지
        const ai = at && this.images['attr_' + h.def.attr];
        if (at && imgOk(ai)) cx.drawImage(ai, px + 1.5, ly - 5, 10, 10);
        else if (at) { cx.fillStyle = at.color; cx.beginPath(); cx.arc(px + 6.5, ly, 4.2, 0, Math.PI * 2); cx.fill(); cx.font = `6px ${FONT}`; cx.fillStyle = '#000'; cx.fillText(at.icon, px + 6.5, ly + 0.5); cx.font = `800 8px ${FONT}`; }
        cx.fillStyle = h.lv >= 5 ? '#ffb347' : '#bfeaff';
        cx.fillText(lvT, px + 13 + tw / 2, ly + 0.5);
        if (h.kdMax && (h.kd > 0.5 || h.kdT > 0)) { // 쓰러짐 게이지: 찰 때만 Lv 칩 아래 (쓰러지면 빨갛게 · 일어날 때까지 줄어듦)
          const bw = 34, bx = hx - bw / 2, by = ly + 8, f = h.kdT > 0 ? Math.max(0, h.kdT / (h.kdSec || 1)) : Math.min(1, h.kd / h.kdMax);
          cx.fillStyle = 'rgba(12,10,28,0.85)'; roundRect(cx, bx - 1, by - 1, bw + 2, 5, 2.5); cx.fill();
          cx.fillStyle = h.kdT > 0 ? '#ff5a4f' : h.poisonT > 0 ? '#8fe85a' : f > 0.7 ? '#ff9a3a' : '#ffd23f'; roundRect(cx, bx, by, Math.max(2, bw * f), 3, 1.5); cx.fill();
        }
        if (h.main) { // 주력: Lv 칩 왼쪽 위에 금별 (한 판에 2명 · Lv5 까지)
          const sx = px - 1, sy = ly - 7, R = 7;
          cx.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? R * 0.45 : R, a = -Math.PI / 2 + (k * Math.PI) / 5; cx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } cx.closePath();
          cx.fillStyle = '#ffb347'; cx.fill(); cx.strokeStyle = '#3a1a00'; cx.lineWidth = 1.2; cx.stroke();
        }
        if (h.guest) { // G 리본
          cx.fillStyle = '#1fb3c9'; cx.beginPath(); cx.arc(px + pw + 1, ly - 6, 5.5, 0, Math.PI * 2); cx.fill(); cx.strokeStyle = '#063a44'; cx.stroke();
          cx.fillStyle = '#fff'; cx.font = `900 7px ${FONT}`; cx.fillText('G', px + pw + 1, ly - 5.5);
        }
      }
      const ly = feet + 9;
      // 배현경 다이어트 게이지 · 고아라 나이 게이지
      if (h.def.diet || h.def.age) {
        const f = h.def.diet ? (h.alt ? h.altT / h.def.diet.sec[h.lv - 1] : h.meter / 100)
          : h.alt ? 1 - h.ageT / h.def.age.old[h.lv - 1] : h.ageT / h.def.age.princess[h.lv - 1];
        const bw = 34;
        cx.fillStyle = 'rgba(0,0,0,0.6)'; cx.fillRect(hx - bw / 2, ly + 8, bw, 4);
        cx.fillStyle = h.def.diet ? (h.alt ? '#ff5fa2' : '#ffb347') : h.alt ? '#a8a8a8' : '#ffc4ec';
        cx.fillRect(hx - bw / 2, ly + 8, bw * clamp01(f), 4);
      }
      // 장전: 발밑 작은 막대 (연발·속사 무기)
      if (h.reloadT > 0 && h.reloadMax > 0.25) {
        const bw = 30, f = 1 - clamp01(h.reloadT / h.reloadMax);
        cx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(cx, hx - bw / 2, hy + 6, bw, 4, 2); cx.fill();
        cx.fillStyle = '#ffd23f'; roundRect(cx, hx - bw / 2, hy + 6, Math.max(2, bw * f), 4, 2); cx.fill();
      }
      // 성준영: 체력 막대 (정소영 잔소리로 찬다 · 0 이면 퇴근)
      if (h.id === 'junyoung' && h.hpMax > 0) {
        const bw = 40, f = clamp01(h.hp / h.hpMax), by = ly + 8, healK = h._healAt ? 1 - (performance.now() - h._healAt) / 400 : 0;
        cx.fillStyle = 'rgba(0,0,0,0.65)'; roundRect(cx, hx - bw / 2 - 1, by - 1, bw + 2, 7, 3); cx.fill();
        cx.fillStyle = f < 0.3 ? '#ff6b6b' : h.allinT > 0 ? '#ffd23f' : '#7fe0a0'; roundRect(cx, hx - bw / 2, by, Math.max(2, bw * f), 5, 2.5); cx.fill();
        if (healK > 0) { cx.globalAlpha = healK; cx.fillStyle = '#ffffff'; roundRect(cx, hx - bw / 2, by, Math.max(2, bw * f), 5, 2.5); cx.fill(); cx.globalAlpha = 1; }
      }
      // 정소영: 준영이 없을 때 부르기 게이지 (분홍 · 가득 차면 등판)
      if (h.id === 'soyoung' && h.callM !== undefined && !g.heroes.some((o) => o.id === 'junyoung' && !o.gone)) {
        const bw = 34, f = clamp01(h.callM / 100);
        cx.fillStyle = 'rgba(0,0,0,0.6)'; cx.fillRect(hx - bw / 2, ly + 8, bw, 4);
        cx.fillStyle = '#ff8fb1'; cx.fillRect(hx - bw / 2, ly + 8, bw * f, 4);
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
    this.drawNag(g);
  }

  // 8칸 반복 띠 한 칸 그리기 (발 = feet · face −1 이면 좌우 뒤집기)
  loopStrip(im, fi, x, feet, face, bw) {
    const fw = im.naturalWidth / 8;
    this.tf(x, feet, 0, face, 1);
    this.cx.drawImage(im, fi * fw, 0, fw, im.naturalHeight, -bw / 2, -bw * FEET, bw, bw);
  }
  // 송바울: 보드 타기(반복) · 돌진 순간(박차기 띠) · 정비(무릎 꿇고 고치기) · 돌진 자국 · 탭한 목표 표시 · 남은 보드 횟수
  drawBaul(g, h, hx, feet, box, sp, t) {
    const cx = this.cx, b = h.bd, B = h.def.board;
    const ride = this.images.hanim_baul_ride, fix = this.images.hanim_baul_fix, atk = this.images.hanim_baul;
    const now = performance.now();
    if (h.airH > 0) { this.tf(hx, feet, 0, 1, 0.4); cx.globalAlpha = 0.35; cx.fillStyle = '#000'; cx.beginPath(); cx.arc(0, 0, 18, 0, Math.PI * 2); cx.fill(); cx.globalAlpha = 1; feet -= h.airH; } // 점프대: 공중 (그림자는 바닥에)
    // 예약한 다음 곳 (타는 중에 탭): 점선 + 보드 표시
    const aim = b.q || null;
    if (aim) {
      this.world(); cx.save();
      cx.setLineDash([5, 6]); cx.lineDashOffset = -t * 30; cx.strokeStyle = 'rgba(122,208,255,0.85)'; cx.lineWidth = 2.2;
      cx.beginPath(); cx.moveTo(hx, feet - 6); cx.lineTo(aim.x, aim.y); cx.stroke(); cx.setLineDash([]);
      const pr = 13 + Math.sin(t * 8) * 2;
      cx.translate(aim.x, aim.y); cx.scale(1, 0.55);
      cx.strokeStyle = '#7ad0ff'; cx.lineWidth = 3; cx.beginPath(); cx.arc(0, 0, pr, 0, Math.PI * 2); cx.stroke();
      cx.fillStyle = 'rgba(122,208,255,0.25)'; cx.fill();
      cx.restore();
      this.world(); cx.save(); cx.translate(aim.x, aim.y - 2); cx.rotate(-0.35); // 작은 보드 모양
      cx.fillStyle = '#7ad0ff'; cx.strokeStyle = '#123a5a'; cx.lineWidth = 1.5; roundRect(cx, -11, -3, 22, 6, 3); cx.fill(); cx.stroke();
      cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(-4, 0, 1.3, 0, Math.PI * 2); cx.arc(4, 0, 1.3, 0, Math.PI * 2); cx.fill();
      cx.restore();
    }
    // 돌진 자국 (하늘색 띠 · 금방 사라짐)
    const tr = h._bTrail || (h._bTrail = []);
    if (b.st === 'dash') tr.push({ x: hx, y: feet - 4, at: now });
    while (tr.length && now - tr[0].at > 260) tr.shift();
    if (tr.length > 1) {
      this.world(); cx.save(); cx.globalCompositeOperation = 'lighter'; cx.lineCap = 'round';
      for (const [w, col] of [[16, 'rgba(90,180,255,0.28)'], [6, 'rgba(230,248,255,0.85)']]) {
        cx.strokeStyle = col; cx.lineWidth = w; cx.beginPath(); cx.moveTo(tr[0].x, tr[0].y); for (const q of tr) cx.lineTo(q.x, q.y); cx.stroke();
      }
      cx.restore(); cx.globalCompositeOperation = 'source-over';
    }
    if (b.st === 'fix' && B.fix) {
      if (!imgOk(fix)) return false;
      // 띠: 0~3 무릎 꿇고 렌치 · 왁스 (반복) · 4 땀 닦기 (중간) · 7 엄지 척 (끝나기 직전)
      const f = b.fixMax ? clamp01(1 - b.fixT / b.fixMax) : 0, gx = hx, gy = feet - box * 1.02;
      const fi = f > 0.82 ? 7 : f > 0.45 && f < 0.56 ? 4 : Math.floor(t * 6) % 4;
      this.loopStrip(fix, fi, hx, feet, 1, box * 1.08);
      // 정비 게이지: 머리 위 동그라미 (다 차면 다시 탄다)
      this.world();
      cx.fillStyle = 'rgba(14,8,30,0.85)'; cx.beginPath(); cx.arc(gx, gy, 11, 0, Math.PI * 2); cx.fill();
      cx.lineWidth = 3.5; cx.strokeStyle = 'rgba(255,255,255,0.18)'; cx.beginPath(); cx.arc(gx, gy, 8, 0, Math.PI * 2); cx.stroke();
      cx.strokeStyle = '#7ad0ff'; cx.lineCap = 'round'; cx.beginPath(); cx.arc(gx, gy, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); cx.stroke(); cx.lineCap = 'butt';
      cx.fillStyle = '#fff'; cx.font = `900 8px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('정비', gx, gy + 0.5);
      return true;
    }
    const face = b.face || 1, since = g.t - (h.lastShotT || -9);
    if (b.st === 'air' && imgOk(atk)) this.loopStrip(atk, 4, hx, feet, face, box * 1.12); // 공중 트릭
    else if (imgOk(atk) && since < 0.42 && b.st !== 'home') this.loopStrip(atk, Math.min(7, 2 + Math.floor((since / 0.42) * 6)), hx, feet, face, box * 1.12);
    else if (imgOk(ride)) this.loopStrip(ride, Math.floor(t * (b.st === 'dash' ? 14 : 7)) % 8, hx, feet + Math.sin(t * 5 + h.slot) * 1.5, face, box * 1.12);
    else return false;
    // 보드 충전 칸: 발밑 (찬 칸 하늘색 · 차는 중인 칸은 조금씩)
    const maxCh = B.charges ? B.charges[h.lv - 1] : 0, w0 = 7, gap = 2, tw = maxCh * (w0 + gap) - gap, part = B.refill ? clamp01((b.refT || 0) / B.refill[h.lv - 1]) : 0;
    this.world();
    for (let k = 0; k < maxCh; k++) { const x0 = hx - tw / 2 + k * (w0 + gap); cx.fillStyle = 'rgba(0,0,0,0.55)'; cx.fillRect(x0, feet + 19, w0, 4); cx.fillStyle = '#7ad0ff'; const f = k < Math.floor(b.ch) ? 1 : k === Math.floor(b.ch) ? part : 0; if (f > 0) cx.fillRect(x0, feet + 19, w0 * f, 4); }
    if (b.fever > 0) { cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.4 + 0.2 * Math.sin(t * 12); cx.fillStyle = '#7ad0ff'; cx.beginPath(); cx.ellipse(hx, feet + 4, 30, 9, 0, 0, Math.PI * 2); cx.fill(); cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over'; } // 총출동: 발밑 빛
    if (b.combo > 0 && g.t - (b.lastLand || -9) < B.combo.win) { cx.fillStyle = '#ffe14d'; cx.font = `900 10px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(`×${b.combo + 1}`, hx, feet + 32); }
    return true;
  }
  // 성준영: 칩 갈퀴로 바닥의 배팅 칩을 긁어모으며 돌아다닌다 — 끌어모으는 반경 고리 · 갈퀴 쪽으로 굴러 들어오는 칩
  drawJunyoung(g, h, hx, feet, box, sp, t) {
    const cx = this.cx, im = this.images.hanim_junyoung_sweep, S0 = h.def.sweep;
    const R0 = S0.r[h.lv - 1] * (h.allinT > 0 ? S0.allinR : 1) * (g.saJy ? 1.2 : 1), gold = h.allinT > 0;
    this.world(); cx.save(); cx.translate(hx, feet - 4); cx.scale(1, 0.42);
    cx.setLineDash([7, 7]); cx.lineDashOffset = t * 24; cx.strokeStyle = gold ? 'rgba(255,210,63,0.75)' : 'rgba(190,140,255,0.45)'; cx.lineWidth = gold ? 4 : 2.5;
    cx.beginPath(); cx.arc(0, 0, R0, 0, Math.PI * 2); cx.stroke(); cx.setLineDash([]); cx.restore();
    const face = h.face || 1, sk = this.skfx;
    if (sk) { // 빨강 · 파랑 · 초록 · 검정 배팅 칩이 둘레에서 갈퀴 앞으로 쓸려 들어온다
      this.world();
      for (let k = 0; k < 6; k++) {
        const ph = (t * 0.9 + k / 6) % 1, a = k * 1.9 + Math.floor(t * 0.9 + k / 6) * 2.3, r = 46 * (1 - ph) + 8;
        const x = hx + face * 16 + Math.cos(a) * r, y = feet - 2 + Math.sin(a) * r * 0.35;
        this.pokerChip(x, y, 3.6, t * 7 + k, 0.35 + (1 - ph) * 0.65, JY_CHIPS[k % JY_CHIPS.length]);
      }
    }
    if (!imgOk(im)) return false;
    const fi = Math.floor(t * 9) % 8, hop = Math.abs(Math.sin(t * 9 * Math.PI / 4)) * 1.5;
    this.loopStrip(im, fi, hx, feet - hop, face, box * 1.05);
    return true;
  }
  pokerChip(x, y, r, ph, a, col) { // 배팅 칩 한 개 (뒤집히며 굴러 들어온다)
    const cx = this.cx, w = Math.abs(Math.cos(ph)) * r + 0.8;
    cx.save(); cx.translate(x, y); cx.globalAlpha = Math.max(0, Math.min(1, a));
    cx.fillStyle = 'rgba(0,0,0,0.45)'; cx.beginPath(); cx.ellipse(0, 1.2, w, r, 0, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = col; cx.beginPath(); cx.ellipse(0, 0, w, r, 0, 0, Math.PI * 2); cx.fill();
    if (w > r * 0.45) { cx.strokeStyle = '#fff'; cx.lineWidth = 1.1; cx.setLineDash([1.6, 1.4]); cx.beginPath(); cx.ellipse(0, 0, w * 0.72, r * 0.72, 0, 0, Math.PI * 2); cx.stroke(); cx.setLineDash([]); cx.fillStyle = 'rgba(255,255,255,0.85)'; cx.beginPath(); cx.ellipse(0, 0, w * 0.32, r * 0.32, 0, 0, Math.PI * 2); cx.fill(); }
    cx.restore();
  }
  // 정소영 잔소리: 말풍선이 준영에게 날아가 체력을 채운다 (game.js 'nag')
  nagFly(x0, y0, x1, y1) { (this._nag || (this._nag = [])).push({ x0, y0, x1, y1, at: performance.now() }); }
  drawNag(g) {
    const L = this._nag;
    if (!L || !L.length) return;
    const cx = this.cx, now = performance.now(), im = this.images.w_bubble, j = g.heroes.find((o) => o.id === 'junyoung' && !o.gone);
    this.world();
    for (let i = L.length - 1; i >= 0; i--) {
      const q = L[i], k = (now - q.at) / 420;
      if (k >= 1) { L.splice(i, 1); if (j) { j._healAt = now; this.fx.burst(j.px, j.py - 40, 6, '#7fe0a0', 70, 'spark', 3, 0.35); } continue; }
      const x1 = j ? j.px : q.x1, y1 = (j ? j.py : q.y1) - 46, e = 1 - (1 - k) * (1 - k);
      const x = q.x0 + (x1 - q.x0) * e, y = q.y0 + (y1 - q.y0) * e - Math.sin(k * Math.PI) * 40, s = 0.8 + Math.sin(k * Math.PI) * 0.35;
      cx.save(); cx.translate(x, y); cx.scale(s, s); cx.rotate(Math.sin(k * 12) * 0.15);
      if (imgOk(im)) cx.drawImage(im, -13, -11, 26, 22);
      else { cx.fillStyle = '#fff'; cx.strokeStyle = '#ff8fb1'; cx.lineWidth = 2; cx.beginPath(); cx.ellipse(0, 0, 12, 9, 0, 0, Math.PI * 2); cx.fill(); cx.stroke(); cx.fillStyle = '#ff5f8f'; cx.font = `900 9px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('!!', 0, 0.5); }
      cx.restore();
    }
  }

  // 이호찬 막차 버스: 그림(fx/bus · bus2) 이 있으면 그 그림 · 없으면 노란 버스 모양
  // 합류 대기: 빈 자리에 흐린 실루엣 + 글자
  drawJoinWait(g) {
    if (!g.joinMode || !g.joinPool || !g.joinPool.length) return;
    const cx = this.cx, box = HERO_BOX;
    for (const j of g.joinPool) {
      const sp = this.sprites['h_' + j.id];
      const x = g.slotX[j.slot], feet = g.rowY + box * FEET_OFF;
      if (x === undefined) continue;
      if (sp && sp.real) { // (자리표시자 그림엔 이름이 그려져 있어서 실루엣으로 안 씀)
        const sil = (this.sils || (this.sils = {}))[j.id] || (this.sils[j.id] = (() => { const c = mkCanvas(sp.c.width, sp.c.height), x2 = c.getContext('2d'); x2.drawImage(sp.c, 0, 0); x2.globalCompositeOperation = 'source-in'; x2.fillStyle = '#c9b8ff'; x2.fillRect(0, 0, c.width, c.height); return c; })());
        this.tf(x, feet, 0, 1, 1); cx.globalAlpha = 0.28 + Math.sin(performance.now() / 500 + j.slot) * 0.06; cx.drawImage(sil, -box / 2, -box * FEET, box, box); cx.globalAlpha = 1;
      }
      this.world();
      cx.font = `900 9px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillStyle = 'rgba(8,4,20,0.7)'; roundRect(cx, x - 22, g.rowY + 16, 44, 14, 7); cx.fill();
      const ai = this.images['attr_' + ((HEROES[j.id] || {}).attr || '')]; if (imgOk(ai)) cx.drawImage(ai, x - 19, g.rowY + 17.5, 11, 11); // 이름은 숨기고 속성 아이콘만 (합류할 때 공개)
      cx.fillStyle = '#d8ccff'; cx.fillText('???', x + 5, g.rowY + 23);
    }
    this.world();
  }
  // 입구 불꽃: vfx_hitspark (폰·병은 조각 그림) — 없으면 코드 불꽃
  addDoorHit(x, y, kind) {
    const s = this.doorHits || (this.doorHits = []);
    if (s.length > 16) s.shift();
    s.push({ x: x + (Math.random() - 0.5) * 10, y, t: performance.now(), kind, r: (Math.random() - 0.5) * 0.6 });
    if (!imgOk(this.images.vfx_hitspark)) this.fx.burst(x, y, 5, '#ffd27a', 120, 'spark', 3, 0.25);
  }
  drawDoorHits() {
    const s = this.doorHits; if (!s || !s.length) return;
    const cx = this.cx, now = performance.now(), img = this.images.vfx_hitspark;
    this.doorHits = s.filter((q) => now - q.t < 260);
    for (const q of this.doorHits) {
      const k = (now - q.t) / 260;
      const alt = q.kind === 'phone' ? this.images.vfx_phone : q.kind === 'slap' ? this.images.vfx_slap : null;
      const im = alt && imgOk(alt) && k < 0.5 ? alt : img;
      if (!imgOk(im)) continue;
      const sz = 46 * (0.7 + k * 0.6);
      this.tf(q.x, q.y, q.r, 1, 1); cx.globalAlpha = 1 - k; cx.drawImage(im, -sz / 2, -sz / 2, sz, sz);
    }
    cx.globalAlpha = 1; this.world();
  }
  // 보스·중간 보스 기술 이펙트 (fx/vfx_*): anim = pop(커졌다 사라짐) · pulse(깜빡이며 유지) · fly(날아감) · grow(예고 원이 커짐)
  vfx(name, x, y, o = {}) {
    const v = this.vfxs || (this.vfxs = []);
    if (v.length > 48) v.shift();
    const q = Object.assign({ name, x, y, t: performance.now(), dur: 600, sz: 90, anim: 'pop', rot: 0, follow: null, tx: x, ty: y }, o);
    const VX = VFX_KIND[name] || (name.startsWith('cc_') ? { blend: 'source-over', layer: 'front' } : VFX_KIND._);
    if (q.blend === undefined) q.blend = VX.blend;
    if (q.layer === undefined) q.layer = q.flat ? 'ground' : VX.layer;
    if (q.col === undefined && VX.col) q.col = VX.col;
    v.push(q);
    // 맞은 자리: 바닥 빛 타원 + 불꽃 튀기 (색 = 기술 색)
    if (VX.impact && !q.follow && this.fx && this.fx.burst) { this.fx.burst(q.x, q.y, 8, VX.col || '#fff', 160, 'dot', 2.6, 0.35); v.push({ name: '_glow', x: q.x, y: q.y + 14, t: q.t, dur: 380, sz: q.sz * 0.9, anim: 'fade', rot: 0, flat: true, blend: 'lighter', layer: 'ground', col: VX.col || '#fff' }); }
  }
  // 알파 경계 (0~1 비율): 한 칸 또는 여러 칸 합친 것
  alphaBox(img, sx, sw, sh, frames = 1) {
    const S = 48, c = this._abc || (this._abc = document.createElement('canvas')); c.width = S; c.height = S;
    const x = c.getContext('2d', { willReadFrequently: true });
    let l = 1, r2 = 0, t = 1, b = 0;
    for (let f = 0; f < frames; f++) {
      x.clearRect(0, 0, S, S); x.drawImage(img, sx + f * sw, 0, sw, sh, 0, 0, S, S);
      const d = x.getImageData(0, 0, S, S).data;
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) if (d[(yy * S + xx) * 4 + 3] > 60) { if (xx < l * S) l = xx / S; if (xx > r2 * S) r2 = (xx + 1) / S; if (yy < t * S) t = yy / S; if (yy > b * S) b = (yy + 1) / S; }
    }
    return { l, r: r2, t, b };
  }
  stripFit(key, strip, n, idle, only = 0) {
    const m = this._fit || (this._fit = {});
    if (m[key]) return m[key];
    let fit = { k: 1, dx: 0, dy: 0 };
    try {
      const fw = strip.naturalWidth / n, fh = strip.naturalHeight;
      const a = this.alphaBox(strip, 0, fw, fh, only || n), i = this.alphaBox(idle, 0, idle.width, idle.height, 1);
      const hS = a.b - a.t, hI = i.b - i.t;
      if (hS > 0.05 && hI > 0.05) {
        const lying = (i.r - i.l) > hI * 1.25; // 누운 모습(문동한 평소)이면 크기는 그대로 · 발만 맞춘다
        const k = lying ? 1 : Math.max(0.75, Math.min(1.35, hI / hS));
        // 아래(발) 맞추기 · 가운데 맞추기
        const dy = (i.b - a.b * k), dx = ((i.l + i.r) / 2 - ((a.l + a.r) / 2) * k) - (0.5 - 0.5 * k) - (1 - k) * 0.5;
        fit = { k, dx: (i.l + i.r) / 2 - 0.5 - (((a.l + a.r) / 2) - 0.5) * k + (1 - k) * 0.5, dy };
        void dx;
      }
    } catch { /* 무시 */ }
    return (m[key] = fit);
  }
  drawVfx(layer = 'front') {
    const v = this.vfxs; if (!v || !v.length) return;
    const cx = this.cx, now = performance.now();
    if (layer === 'ground') this.vfxs = v.filter((q) => now - q.t < q.dur && (!q.follow || !q.follow.gone));
    for (const q of this.vfxs) {
      if ((q.layer || 'front') !== layer) continue;
      const k = (now - q.t) / q.dur;
      const el = now - q.t;
      if (q.name === '_glow') { const a0 = (1 - k) * 0.55; this.tf(q.x, q.y, 0, 1, 0.42); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = a0; const gr = cx.createRadialGradient(0, 0, 0, 0, 0, q.sz * 0.5); gr.addColorStop(0, q.col); gr.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = gr; cx.beginPath(); cx.arc(0, 0, q.sz * 0.5, 0, Math.PI * 2); cx.fill(); cx.globalCompositeOperation = 'source-over'; continue; }
      const img = this.images['vfx_' + q.name] || this.images[q.name] || (q.name.startsWith('cc_') ? this.ccIcons && this.ccIcons[q.name] : null);
      let x = q.follow ? q.follow.x : q.x, y = q.follow ? q.follow.y + (q.dy || 0) : q.y, s = 1, a = 1, rot = q.rot;
      const lifeS = el < q.dur * 0.22 ? 0.6 + (el / (q.dur * 0.22)) * 0.45 : el < q.dur * 0.32 ? 1.05 - ((el - q.dur * 0.22) / (q.dur * 0.1)) * 0.05 : 1 + Math.max(0, k - 0.75) * 0.3;
      const lifeA = Math.min(1, el / 80) * (k > 0.75 ? (1 - k) / 0.25 : 1);
      if (q.anim === 'pop') { s = lifeS * (0.95 + k * 0.15); a = lifeA; }
      else if (q.anim === 'fade') { s = lifeS; a = lifeA; }
      else if (q.anim === 'pulse') { s = (el < 120 ? 0.6 + (el / 120) * 0.4 : 1) * (1 + Math.sin(now / 90) * 0.05); a = Math.min(1, el / 80) * (k > 0.85 ? (1 - k) / 0.15 : 1); rot += Math.sin(now / 300) * 0.1; }
      else if (q.anim === 'grow') { s = (0.55 + k * 0.5) * (1 + Math.sin(now / 110) * 0.03); a = Math.min(1, el / 80) * (0.6 + Math.sin(now / 90) * 0.18) * (k > 0.85 ? (1 - k) / 0.15 : 1); }
      else if (q.anim === 'fly') { x = q.x + (q.tx - q.x) * k; y = q.y + (q.ty - q.y) * k - Math.sin(k * Math.PI) * 60; rot = q.rot + k * 9; a = 1; }
      else if (q.anim === 'streak') { s = 1; a = 1 - k; }
      else if (q.anim === 'line') { x = q.x + (q.tx - q.x) * k; y = q.y + (q.ty - q.y) * k; rot = q.rot; a = k > 0.85 ? (1 - k) / 0.15 : 1; // 곧게 날아감 + 잔상
        if (img && imgOk(img)) { for (let gi = 3; gi >= 1; gi--) { const kk = Math.max(0, k - gi * 0.05); this.tf(q.x + (q.tx - q.x) * kk, q.y + (q.ty - q.y) * kk, rot, 1, 1); cx.globalAlpha = 0.18 * (4 - gi) * a; const w = q.sz, hh = q.sz * (img.naturalHeight / img.naturalWidth); cx.drawImage(img, -w / 2, -hh / 2, w, hh); } } }
      else if (q.anim === 'ring') { const ek = 1 - (1 - k) * (1 - k); x = q.x + (q.tx - q.x) * ek; y = q.y + (q.ty - q.y) * ek; s = 0.3 + k * 0.9; rot = q.norot ? q.rot : q.rot + k * 4; a = k < 0.15 ? k / 0.15 : (1 - k) / 0.85; }
      if (q.name === 'pullLine') { this.world(); cx.globalAlpha = 1 - k; cx.strokeStyle = q.col; cx.lineWidth = 2.5; cx.setLineDash([6, 5]); cx.lineDashOffset = -now / 20; cx.beginPath(); cx.moveTo(q.x, q.y); cx.quadraticCurveTo((q.x + q.tx) / 2 + 30, (q.y + q.ty) / 2 - 30, q.tx, q.ty); cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1; continue; }
      if (q.spin) rot += now / 250;
      const fsz = q.follow && q.follow.def && q.follow.def.size && !q.fixed ? Math.max(0.7, Math.min(1.6, q.follow.def.size / 70)) : 1;
      this.tf(x, y, rot, s * fsz, (q.flat ? s * 0.45 : s) * fsz);
      cx.globalAlpha = Math.max(0, Math.min(1, a));
      if (q.blend === 'lighter' || q.blend === 'screen') cx.globalCompositeOperation = q.blend;
      if (img && imgOk(img)) { const w = q.sz * (q.wMul || 1), h = q.sz * (img.naturalHeight / img.naturalWidth) * (q.wMul ? 1 : 1); cx.drawImage(img, -w / 2, -h / 2, w, h); }
      else { // 코드 모양
        cx.strokeStyle = q.col || '#ff5a5a'; cx.lineWidth = 4; cx.beginPath(); cx.arc(0, 0, q.sz * 0.45, 0, Math.PI * 2); cx.stroke();
        if (q.name === 'stun') { cx.fillStyle = '#ffd23f'; for (let i = 0; i < 3; i++) { const aa = now / 200 + i * 2.1; cx.beginPath(); cx.arc(Math.cos(aa) * 14, Math.sin(aa) * 5, 4, 0, Math.PI * 2); cx.fill(); } }
      }
      cx.globalCompositeOperation = 'source-over';
    }
    cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over'; this.world();
  }
  addSlash(x, y) { const s = this.slashes || (this.slashes = []); if (s.length > 12) s.shift(); s.push({ x, y, t: performance.now(), r: (Math.random() - 0.5) * 1.2 }); }
  drawSlashes() {
    const s = this.slashes, img = this.images.w_claw;
    if (!s || !s.length || !imgOk(img)) { if (s) s.length = 0; return; }
    const cx = this.cx, now = performance.now();
    this.slashes = s.filter((q) => now - q.t < 220);
    for (const q of this.slashes) { const k = (now - q.t) / 220; this.tf(q.x, q.y, q.r, 1 + k * 0.3, 1 + k * 0.3); cx.globalAlpha = 1 - k; cx.drawImage(img, -36, -36, 72, 72); }
    cx.globalAlpha = 1; this.world();
  }
  drawBuses(g) {
    const cx = this.cx;
    for (const b of g.buses) {
      const img = this.images[b.big ? 'bus2' : 'bus'];
      const w = b.w * (b.big ? 1.05 : 1.25), h = img && imgOk(img) ? w * (img.naturalHeight / img.naturalWidth) : w * (b.big ? 1.25 : 1.9); // 그림: 뒷모습 · 위로 달림 (비율 그대로)
      this.tf(b.x, b.y, 0, 1, 1);
      { const gr = cx.createLinearGradient(0, 20, 0, 140); gr.addColorStop(0, 'rgba(255,210,63,0.28)'); gr.addColorStop(1, 'rgba(255,210,63,0)'); cx.fillStyle = gr; cx.fillRect(-b.w / 2, 20, b.w, 120); } // 지나간 자리 빛
      if (b.gold) { cx.shadowColor = 'rgba(255,200,40,0.95)'; cx.shadowBlur = 22; }
      if (img && imgOk(img)) cx.drawImage(img, -w / 2, -h / 2, w, h);
      else {
        cx.fillStyle = '#f5b800'; roundRect(cx, -w / 2, -h / 2, w, h, 12); cx.fill();
        cx.strokeStyle = '#3a2400'; cx.lineWidth = 3; cx.stroke();
        cx.fillStyle = '#9fdcff'; for (let i = 0; i < 4; i++) { roundRect(cx, -w / 2 + 8, -h / 2 + 14 + i * (h / 4.6), w - 16, h / 7, 4); cx.fill(); }
        cx.fillStyle = '#fff6b0'; cx.fillRect(-w / 2 + 6, -h / 2 + 2, 10, 6); cx.fillRect(w / 2 - 16, -h / 2 + 2, 10, 6);
      }
      if (b.gold) { cx.shadowBlur = 0; cx.shadowColor = 'transparent'; cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.18; cx.fillStyle = '#ffd23f'; cx.fillRect(-w / 2, -h / 2, w, h); cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over'; }
    }
    this.world();
  }
  drawProjs(g) {
    const cx = this.cx, P = this.projSprites;
    for (const p of g.projs) {
      if (p.dead || !p.lob) continue;
      const k = Math.min(1, p.lt / p.T);
      this.tf(p.tx, p.ty + 6, 0, 1, 0.4);
      cx.globalAlpha = 0.25 + k * 0.35;
      cx.strokeStyle = p.type === 'heart' ? '#ff7fc8' : p.type === 'stamp' ? '#ffd23f' : '#7be38f'; cx.lineWidth = 3;
      cx.beginPath(); cx.arc(0, 0, p.splash * (0.4 + k * 0.6), 0, TAU); cx.stroke();
      cx.globalAlpha = 1;
    }
    let shown = 0;
    const cap = g.projs.length > 120 ? g.projs.length - 120 : 0; // 화면 한도 120: 넘치면 오래된 것부터 안 그림 (피해는 그대로)
    for (let pi = 0; pi < g.projs.length; pi++) {
      const p = g.projs[pi];
      if (p.dead || pi < cap) continue;
      shown++;
      if (this.kit && this.kit.drawProj(p)) continue; // 대개편: 멤버마다 다른 비행 그림 (kitfx.js)
      if (p.type === 'tap' && p.hero && p.hero.id === 'jungmin' && this.projSprites.jmBottle) { // 홍정민: 거꾸로 든 소주병이 빙글빙글 (잔상 2개 · 뒤로 튀는 술방울)
        const bs = this.projSprites.jmBottle, sv = Math.hypot(p.vx || 0, p.vy || 0) || 1, ux = (p.vx || 0) / sv, uy = (p.vy || -1) / sv, spin = this.fx.time * 17 + (p.uid || pi);
        cx.globalCompositeOperation = 'lighter';
        for (let k = 1; k <= 3; k++) { const d = 8 + k * 8, j = Math.sin(this.fx.time * 30 + k * 2 + pi) * 3; this.tf(p.x - ux * d - uy * j, p.y - uy * d + ux * j, 0, 1, 1); cx.globalAlpha = 0.75 - k * 0.18; cx.fillStyle = '#c8f6ff'; cx.beginPath(); cx.arc(0, 0, 2.6 - k * 0.4, 0, TAU); cx.fill(); }
        cx.globalCompositeOperation = 'source-over';
        for (let k = 2; k >= 1; k--) { this.tf(p.x - ux * k * 9, p.y - uy * k * 9, spin - k * 0.55, 1, 1); cx.globalAlpha = 0.32 - k * 0.1; cx.drawImage(bs.c, -bs.w / 2, -bs.h / 2, bs.w, bs.h); }
        cx.globalAlpha = 1; this.tf(p.x, p.y, spin, 1, 1); cx.drawImage(bs.c, -bs.w / 2, -bs.h / 2, bs.w, bs.h);
        continue;
      }
      // 그린 투사체: 멤버 물건 그림을 날아가는 방향으로
      if (p.type === 'bouquet' && imgOk(this.images.pBouquet)) { // 8장 임수빈 부케: 빙글빙글 + 꽃잎
        const sz = 34 * (p.big ? 1.4 : 1);
        this.tf(p.x, p.y, (p.rot || 0) + this.fx.time * 6, 1, 1); cx.drawImage(this.images.pBouquet, -sz / 2, -sz / 2, sz, sz);
        if (Math.random() < 0.25) this.fx.part('dot', p.x, p.y, (Math.random() - 0.5) * 40, 20, 0.4, 3, '#ffc0dc');
        continue;
      }
      const an = p.hero && p.type !== 'moto' && p.type !== 'gf' && PROJ_ART[p.hero.id];
      if (an === 'card_y') { // 운영진 경고장: 그림(민무늬 노란 사각형) 대신 코드로 그린 심판 카드 · 날아가며 팔랑팔랑
        const sc = this.projSprites[p.big ? 'staffCardRed' : 'staffCard'];
        if (sc) { const ang = Math.atan2(p.vy || 0, p.vx || 1) + Math.PI / 2 + Math.sin(this.fx.time * 14 + (p.uid || pi)) * 0.35; this.tf(p.x, p.y, ang, 1, 1); cx.drawImage(sc.c, -sc.w / 2, -sc.h / 2, sc.w, sc.h); continue; }
      }
      const art = an && this.images['w_' + (an === 'card_y' && p.big ? 'card_r' : an)];
      if (art && imgOk(art)) {
        const sz = Math.max(18, (p.r || 8) * 3.1) * (p.big ? 1.45 : 1);
        const ang = p.lob || an === 'coin' || an === 'chip' ? (p.rot || 0) : Math.atan2(p.vy || 0, p.vx || 1);
        this.tf(p.x, p.y, ang, 1, 1);
        cx.drawImage(art, -sz / 2, -sz / 2, sz, sz);
        continue;
      }
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
        case 'jab': { // 배현경 날씬 잽: 글러브가 날아가는 쪽을 보고 · 뒤로 속도선 세 줄 (다른 멤버 잽은 그대로)
          if (!(p.hero && p.hero.id === 'hyungyeong')) { s = P.jab; this.tf(p.x, p.y, p.rot, 1, 1); break; }
          this.tf(p.x, p.y, Math.atan2(p.vy || 0, p.vx || 1), 1, 1);
          cx.globalCompositeOperation = 'lighter'; cx.strokeStyle = 'rgba(255,175,215,0.75)'; cx.lineWidth = 1.6; cx.lineCap = 'round';
          cx.beginPath(); for (const oy of [-5, 0, 5]) { cx.moveTo(-9, oy); cx.lineTo(oy ? -20 : -27, oy); } cx.stroke();
          cx.globalCompositeOperation = 'source-over'; s = P.jabGlove;
          break;
        }
        case 'gf': {
          // 윤준서 여사친: 동그랗게 말려 데굴데굴
          // 잘 보이게: 1.6배 · 흰/분홍 테두리 빛 · 잔상 꼬리
          const img = this.images.gf;
          if (imgOk(img) && !this._gfGlow) {
            const c = document.createElement('canvas'); c.width = c.height = 80;
            const x = c.getContext('2d');
            x.drawImage(img, 13, 13, 54, 54); // 테두리 빛 없이 (잔상 꼬리만)
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
          // 금빛 확성기 충격파: 왕관 그림 없이 겹 고리 두 개 (앞쪽 고리가 살짝 떨림)
          cx.strokeStyle = 'rgba(255,225,110,0.55)'; cx.lineWidth = 1.6;
          for (const k of [0.72, 0.46]) { cx.beginPath(); cx.ellipse(p.x, y + 10 * (1 - k), w * k, 16 * k + Math.sin(g.t * 30) * 1.2, 0, Math.PI * 1.08, -Math.PI * 0.08); cx.stroke(); }
          s = null;
          break;
        }
        default: s = P[p.type]; this.tf(p.x, p.y, p.rot, 1, 1);
      }
      if (s) {
        const pi = s.paint && this.images[s.paint];
        if (imgOk(pi)) { const hh = Math.max(s.h, s.w) * 1.3, ww = hh * pi.naturalWidth / pi.naturalHeight; cx.drawImage(pi, -ww / 2, -hh / 2, ww, hh); } // 그린 그림: 같은 자리 · 1.3배 · 회전 그대로
        else cx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
      }
    }
    for (const q of g.eprojs || []) {
      if (this.efx && this.efx.drawEproj(q)) continue; // 진상 투척물 (enemyfx.js 코드 그림)
      const s = q.kind === 'duck' ? P.duck : q.kind === 'paper' ? P.paper : P['ep_' + q.kind] || P.rumor;
      this.tf(q.x, q.y, q.kind === 'rumor' ? Math.sin(q.t * 14) * 0.12 : q.t * 12, 1, 1);
      { const pi = s.paint && this.images[s.paint]; if (imgOk(pi)) { const hh = Math.max(s.h, s.w) * 1.3, ww = hh * pi.naturalWidth / pi.naturalHeight; cx.drawImage(pi, -ww / 2, -hh / 2, ww, hh); } else cx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h); }
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
      let s = n.crit ? 1.25 : n.eff > 0 ? 0.95 : n.eff < 0 ? 0.52 : 0.62;
      if (n.pop > 0) { s *= 1 + n.pop * 2.5; n.pop = Math.max(0, n.pop - 1 / 60); }
      if (n.crit && n.eff > 0) s = 1.45;
      if (age < 0.1) s *= 1 + (1 - age / 0.1) * (n.crit || n.eff > 0 ? 1 : 0.4);
      this.tf(n.x, n.y, 0, s, s);
      cx.globalAlpha = Math.min(1, n.life / (n.max * 0.35)) * (n.eff < 0 ? 0.75 : n.crit || n.eff > 0 ? 1 : 0.85);
      {
        cx.lineWidth = n.crit || n.eff > 0 ? 5 : this.fx.lite ? 3 : 4;
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
    if (g && this.skfx) this.skfx.draw('screen', g); // 스킬: 화면 어둡게 · 조명 · 집중선
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
    if (b) this.drawBanner(b, g);
  }

  drawBanner(b, g) {
    const cx = this.cx, W = this.W, H = this.H, k = this.k;
    const p = b.t / b.life;
    const inT = Math.min(1, b.t / 0.28);
    const outT = Math.max(0, (b.t - (b.life - 0.35)) / 0.35);
    const ease = 1 - Math.pow(1 - inT, 3);
    let y = H * (b.kind === 'boss' ? 0.34 : 0.3);
    // 보스전: 합류 · 웨이브 같은 배너가 보스를 가리지 않게 보스 아래(안 되면 위)로 비켜서
    if (b.kind !== 'boss' && g && g.bossAlive > 0) {
      const boss = g.enemies.find((e) => e.boss && !e.dead && e.y > 0);
      if (boss && Math.abs(boss.y - y) < 90) { const below = boss.y + 120; y = below < (g.ropeY || H * 0.7) - 70 ? below : Math.max(110, boss.y - 130); b.y0 = b.y0 === undefined ? y : b.y0 + (y - b.y0) * 0.15; y = b.y0; }
    }
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
    const band = b.kind === 'boss' || b.kind === 'rage' || b.kind === 'hidden' || b.kind === 'big';
    const withArt = !!(band && b.sprite && this.sprites[b.sprite]); // 그림은 띠 배너에서만 그린다 → 그때만 글자를 오른쪽으로
    const tx = withArt ? W / 2 + 44 : W / 2;
    cx.setTransform(k * scale, 0, 0, k * scale, k * (tx + jit + (1 - ease) * 60), k * (y - (b.sub ? 10 : 0)));
    cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.lineJoin = 'round';
    // 긴 제목("팬클럽 썰매 활강!" · "올인 콜! 준영 등판")은 화면 폭에 맞게 글자를 줄인다
    const avail = withArt ? 2 * Math.min(tx - (8 + (b.kind === 'boss' ? 130 : 84) * 0.8), W - tx) - 12 : W - 24;
    let size = b.kind === 'wave' ? 44 : b.kind === 'boss' ? 30 : 26;
    if (b.fit === undefined) { cx.font = `900 italic ${size}px ${FONT}`; const w = cx.measureText(b.text).width + 8; cx.font = `800 13px ${FONT}`; const ws = b.sub ? cx.measureText(b.sub).width + 5 : 0; b.fit = Math.min(1, avail / w); b.fitSub = ws ? Math.min(1, avail / ws) : 1; }
    size = Math.round(size * b.fit);
    cx.font = `900 italic ${size}px ${FONT}`;
    cx.lineWidth = 8; cx.strokeStyle = 'rgba(15,5,25,0.95)';
    cx.strokeText(b.text, 0, 0);
    const gr = cx.createLinearGradient(0, -size / 2, 0, size / 2);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, b.kind === 'wave' ? '#ffd23f' : '#ffe9f5'); gr.addColorStop(1, b.kind === 'wave' ? '#ff8a00' : b.color);
    cx.fillStyle = gr;
    cx.fillText(b.text, 0, 0);
    if (b.sub) {
      cx.font = `800 ${Math.max(9, Math.round(13 * b.fitSub))}px ${FONT}`;
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
