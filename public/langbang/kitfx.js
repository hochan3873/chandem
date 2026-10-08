// 랑방 대전 — 2026-10 대개편 연출 (코드 그림): 멤버마다 다른 기본 공격 비행 · 맞는 모양 · 스킬 시전 동작 · 스킬 효과
//  sim.js 의 g.zones(장판) · g.rings(퍼지는 고리) · 새 투사체(stamp · pistol · rose · bouquet 리본 · 점멸 손 · 구르는 덤벨 · 주먹 충격파 · 지팡이 고리) · 진상 상태(화상 · 얼음 · 장미 · 검열 · 춤)
//  game.js handleEvents 가 onEvent() 로 넘기고, render.js draw() 가 층마다 draw(layer, g) · drawProjs 가 drawProj(p) · drawHeroes 가 castPose(h) 를 부른다
//  게임 숫자는 건드리지 않는다 — 그림만. 진상이 많으면(busy) 입자를 줄인다.
import { HEROES } from './data.js';

const TAU = Math.PI * 2;
const FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const eOut = (k) => 1 - (1 - k) * (1 - k);
const imgOk = (im) => !!(im && im.complete && im.naturalWidth > 0);
const CAST_MS = 700;
const rmOn = () => typeof document !== 'undefined' && !!document.body && document.body.classList.contains('rm'); // 연출 줄이기
const rnd = (a, b) => a + Math.random() * (b - a);
const eBack = (k) => { const s = 1.7; k -= 1; return 1 + k * k * ((s + 1) * k + s); };
// 미리 구운 빛 덩어리 (그라데이션을 매 프레임 만들지 않게) — 서명훈 얼음 · 저주
const GLOWS = {};
function glowSpr(name, stops) {
  if (GLOWS[name]) return GLOWS[name];
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d');
  const gr = x.createRadialGradient(48, 48, 0, 48, 48, 48); for (const [o, col] of stops) gr.addColorStop(o, col);
  x.fillStyle = gr; x.fillRect(0, 0, 96, 96); return (GLOWS[name] = c);
}
const gIce = () => glowSpr('ice', [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(170,240,255,0.8)'], [0.6, 'rgba(60,170,255,0.25)'], [1, 'rgba(0,80,200,0)']]);
const gCurse = () => glowSpr('curse', [[0, 'rgba(255,240,255,1)'], [0.22, 'rgba(255,90,230,0.85)'], [0.55, 'rgba(150,30,220,0.3)'], [1, 'rgba(60,0,120,0)']]);
const gBand = () => { // 얼음 위를 쓱 지나가는 빛 띠 (가로 그라데이션)
  if (GLOWS.band) return GLOWS.band; if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 64; c.height = 8; const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 0, 64, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 8); return (GLOWS.band = c);
};
const ICE_NEED = (HEROES.myunghoon && HEROES.myunghoon.ice && HEROES.myunghoon.ice.need) || 3;

// 스킬 시전 동작: 멤버마다 다른 몸짓 (k = 0→1 · 0.7초) — dx · dy · 기울기 · 가로 · 세로 배율
const POSE = {
  bangjang: (k) => ({ dy: -Math.sin(Math.min(1, k * 1.6) * Math.PI) * 16, sy: k > 0.6 && k < 0.8 ? 0.82 : 1, sx: k > 0.6 && k < 0.8 ? 1.14 : 1 }), // 깃발 들고 펄쩍 → 쿵
  staff: (k) => ({ rot: Math.sin(k * Math.PI) * 0.32, dy: Math.sin(k * Math.PI) * -6 }), // 몸을 숙여 카드를 내리꽂기
  gunman: (k) => ({ rot: -0.12 * Math.sin(k * Math.PI), dx: Math.sin(k * 60) * 2 * (1 - k) }), // 뒤로 젖히며 탕탕 반동
  gunnyeo: (k) => (k < 0.4 ? { sy: 1 - 0.2 * (k / 0.4), sx: 1 + 0.08 * (k / 0.4) } : { sy: 0.8 + 0.38 * Math.sin(((k - 0.4) / 0.6) * Math.PI) + 0.2 * ((k - 0.4) / 0.6), dy: -10 * Math.sin(((k - 0.4) / 0.6) * Math.PI) }), // 무릎 꿇고 → 두 팔 번쩍 (방패)
  myunghoon: (k) => ({ sx: 1 + 0.16 * Math.sin(k * Math.PI), sy: 1 - 0.1 * Math.sin(k * Math.PI), dx: Math.sin(k * 80) * 1.5 }), // 실눈: 옆으로 쭉 · 부르르
  dohoon: (k) => ({ dy: -Math.sin(k * Math.PI) * 22, rot: k * TAU }), // 마이크 들고 공중 한 바퀴
  ingyu: (k) => ({ dx: Math.sin(k * 90) * 3 * (1 - k * 0.5), sy: 1 - 0.06 * Math.abs(Math.sin(k * 40)) }), // 시동: 부르릉 떨림
  donghan: () => null,
  youngjun: (k) => (k < 0.35 ? { sy: 0.78, sx: 1.12 } : { dy: -Math.sin(((k - 0.35) / 0.65) * Math.PI) * 26, rot: 0.4 * Math.sin(((k - 0.35) / 0.65) * Math.PI) }), // 웅크렸다 → 덮치기
  eunok: (k) => ({ rot: -0.38 * Math.sin(k * Math.PI), dy: -4 * Math.sin(k * Math.PI) }), // 고개 젖혀 원샷
  hanna: (k) => ({ rot: Math.sin(k * TAU * 1.5) * 0.22, sx: 1 + 0.12 * Math.sin(k * Math.PI), sy: 1 + 0.12 * Math.sin(k * Math.PI), dx: Math.sin(k * TAU) * 6 }), // 골반 흔들며 윙크 (좌우로 살랑)
  sunggu: (k) => ({ dy: -10 * Math.sin(k * Math.PI), rot: 0.1 * Math.sin(k * TAU) }), // 지팡이 번쩍 들고 부들
  junseo: (k) => ({ dx: Math.sin(k * TAU * 2) * 7, rot: Math.sin(k * TAU * 2) * 0.08 }), // 손 흔들며 "얘들아~"
  hyungyeong: (k) => ({ sx: 1 + 0.2 * Math.sin(k * Math.PI * 2) * (1 - k), sy: 1 - 0.15 * Math.sin(k * Math.PI * 2) * (1 - k) }), // 주사 푹 → 말랑
  ara: (k) => (k < 0.5 ? { sy: 1 + 0.22 * (k / 0.5), sx: 1 - 0.08 * (k / 0.5) } : { sy: 0.8 + 0.2 * ((k - 0.5) / 0.5), sx: 1.15 - 0.15 * ((k - 0.5) / 0.5) }), // 망치 쭉 들었다 쾅
  hochan: (k) => ({ sx: 1 + 0.18 * Math.sin(k * Math.PI), sy: 1 + 0.18 * Math.sin(k * Math.PI), dy: -8 * Math.sin(k * Math.PI) }), // 왕의 포즈
  soyoung: (k) => ({ rot: 0.25 * Math.sin(k * Math.PI), dx: 6 * Math.sin(k * Math.PI) }), // 손가락 쭉 "준영아!"
  jieun: (k) => ({ dy: -18 * Math.sin(k * Math.PI), rot: 0.06 * Math.sin(k * TAU * 2) }), // 스르르 떠오름
  sanghwa: (k) => ({ rot: 0.34 * Math.sin(Math.min(1, k * 1.4) * Math.PI), dy: 4 * Math.sin(k * Math.PI) }), // 매너 인사 (꾸벅)
  jungmin: (k) => ({ sy: 1 - 0.14 * Math.sin(k * Math.PI), dx: Math.sin(k * 50) * 2 }), // 붕대 꽉 당기기
  jiwon: (k) => ({ dy: -12 * Math.abs(Math.sin(k * TAU)), sx: 1 + 0.1 * Math.sin(k * TAU * 2) }), // 두 손 번쩍 콩콩
  wonsik: (k) => ({ sx: 1 + 0.2 * Math.sin(k * Math.PI), sy: 1 - 0.05 * Math.sin(k * Math.PI) }), // 근육 펌핑
  baul: (k) => ({ rot: k * TAU, dy: -20 * Math.sin(k * Math.PI) }), // 보드 트릭 한 바퀴
  byunghwa: (k) => ({ rot: -0.2 * Math.sin(k * Math.PI), sx: 1 + 0.14 * Math.sin(k * Math.PI), sy: 1 + 0.14 * Math.sin(k * Math.PI) }), // 무대 인사 (팔 벌리기)
  jeongseob: (k) => ({ sy: 1 - 0.12 * Math.abs(Math.sin(k * TAU)), dy: 3 * Math.abs(Math.sin(k * TAU)) }), // 쿵쿵
  subin: (k) => ({ sx: Math.cos(k * TAU * 2) * 0.9 + 0.1 * Math.sign(Math.cos(k * TAU * 2) || 1), dy: -10 * Math.sin(k * Math.PI) }), // 피루엣 두 바퀴 (가로로 뒤집히며 도는 3D 턴)
  dragon: (k) => ({ dy: -34 * Math.sin(k * Math.PI), sx: 1 - 0.15 * Math.sin(k * Math.PI), sy: 1 - 0.15 * Math.sin(k * Math.PI), rot: 0.2 * Math.sin(k * TAU) }), // 뭉치가 날개 펴고 휙 떠오름
};

export class KitFx {
  constructor(R) { this.R = R; this.list = []; this.g = null; }
  get cx() { return this.R.cx; }
  get fx() { return this.R.fx; }
  now() { return this.fx.time; }
  add(kind, o) { o.kind = kind; o.t0 = this.now(); this.list.push(o); if (this.list.length > 140) this.list.shift(); return o; }
  // 스킬 시전 동작 (render.js drawHeroes) — 없으면 null
  castPose(h) {
    if (!h._castAt) return null;
    const ms = performance.now() - h._castAt;
    if (ms > CAST_MS || ms < 0) return null;
    const f = POSE[h.id];
    const o = f ? f(ms / CAST_MS) : null;
    if (!o) return null;
    return { dx: o.dx || 0, dy: o.dy || 0, rot: o.rot || 0, sx: o.sx === undefined ? 1 : o.sx, sy: o.sy === undefined ? 1 : o.sy };
  }

  // 박나영: 급강하로 하늘에 있는 동안 · 돌아오는 동안은 자리 그림을 숨긴다 (render.js drawHeroes)
  diveHidden(g, h) { return (g.zones || []).some((z) => z.kind === 'dive' && z.hero === h && z.t > 0) || (!!h._diveHomeT && this.now() < h._diveHomeT && h._diveHomeT - this.now() < 1); }
  onEvent(g, e, busy) {
    if (g !== this.g) { this.list.length = 0; this.g = g; }
    const fx = this.fx;
    switch (e.type) {
      case 'stampLand': this.add('stamp', { x: e.x, y: e.y, r: e.r, dur: 0.5 }); if (!busy) fx.burst(e.x, e.y, 6, '#ffe14d', 110, 'shard', 4, 0.4, 260); break;
      case 'pistol': if (!busy) { fx.burst(e.x, e.y - 4, e.head ? 8 : 3, e.head ? '#ff5a4f' : '#fff4b0', 90, 'spark', 3, 0.18); } break;
      case 'ringOut': this.add('ring', { x: e.x, y: e.y, R: e.R, dur: e.T + 0.15 }); break;
      case 'chant': fx.text(e.x, e.y - 96, '떼창!', '#c9a3ff', 18, 1.1); for (const h of g.heroes) this.add('chant', { h, dur: 1.2 }); if (e.fixed) fx.text(e.fx, e.fy - 80, '해제!', '#9dffb0', 13, 0.9); break;
      case 'clockTick': if (!busy) fx.ring(e.x, e.y, e.r * 0.3, e.r, 0.3, '#d6c2ff', 3); break;
      case 'breath': { // 박나영 불 뿜기: 박나뇽 입에서 실제 부채꼴 끝까지 (그림은 d_breath · 불티 · 끝 연기)
        const h = g.heroes.find((q) => q.id === e.hero && !q.gone) || null;
        this.add('breath', { h, x: e.x, y: e.y, a: e.a, half: e.half, r: e.r, dur: 0.45, seed: Math.random() * 8, rm: rmOn(), busy, smoked: false });
        break;
      }
      case 'quake': this.add('quake', { x: e.x, y: e.y, x2: e.x2, y2: e.y2, w: e.w, dur: 0.7 }); fx.addShake(3); if (!busy) for (let i = 0; i < 8; i++) { const k = Math.random(); fx.part('dot', e.x + (e.x2 - e.x) * k, e.y + (e.y2 - e.y) * k, (Math.random() - 0.5) * 80, -80 - Math.random() * 80, 0.5, 4, '#b98a5a', { grav: 400 }); } break;
      case 'spotlight': this.add('spot', { x: e.x, y: e.y, r: e.r, hx: e.hx, hy: e.hy, dur: 0.6 }); break;
      case 'jmSwing': this.add('swing', { x: e.x, y: e.y, r: e.r, arc: e.arc, dur: 0.28 }); break;
      case 'counter': fx.burst(e.x, e.y, 6, '#ffffff', 160, 'star', 5, 0.3); if (!busy && Math.random() < 0.3) fx.text(e.hx, e.hy - 40, '어딜!', '#9be09b', 13, 0.7); this.add('counter', { x: e.x, y: e.y, hx: e.hx, hy: e.hy, dur: 0.22 }); break;
      case 'catHop': this.add('hop', { x: e.x, y: e.y, x2: e.x2, y2: e.y2, dur: 0.25 }); break;
      case 'blink': if (!busy) this.add('pix', { x: e.x, y: e.y - 6, dur: 0.3, n: 5 }); break;
      case 'bloom': this.add('bloom', { x: e.x, y: e.y, r: e.r, dur: 0.6 }); if (!busy) for (let i = 0; i < 8; i++) fx.part('heart', e.x, e.y, (Math.random() - 0.5) * 160, -60 - Math.random() * 90, 0.7, 8, '#ff4f7a', { grav: 150 }); break;
      case 'bloomAll': fx.text(e.x, e.y - 100, `장미 ${e.n}송이 개화!`, '#ff7aa0', 15, 1.1); break;
      case 'censor': if (!busy) fx.text(e.x, e.y, '검열 완료', '#ff4f6a', 11, 0.7); break;
      case 'pixelPop': this.add('pix', { x: e.x, y: e.y, dur: 0.5, n: 14, r: e.r }); fx.ring(e.x, e.y, 6, e.r, 0.35, '#ff4fb0', 3); break;
      case 'shredSpread': if (!busy) this.add('line', { x: e.x, y: e.y, x2: e.x2, y2: e.y2, col: '#ff4fb0', dash: true, dur: 0.25 }); break;
      case 'iceFreeze': { // 얼음 3겹 → 꽁꽁: 서리가 확 번지며 얼음 블록이 솟는다 (블록은 drawIce) · 조각 몇 개 튐
        const few = busy || rmOn();
        this.add('freezein', { x: e.x, y: e.y, r: e.r || 16, dur: 0.45 });
        this.iceShards(e.x, e.y + 6, few ? 3 : 6, 150, -120);
        if (!busy) fx.text(e.x, e.y - 22, '꽁꽁!', '#bff6ff', 14, 0.7);
        break;
      }
      case 'fuseSet': break;
      case 'redcard': this.add('redcard', { x: e.x, y: e.y, r: e.r, hx: e.hx, hy: e.hy, dur: 0.75 }); break;
      case 'sendOff': this.add('sendoff', { x: e.x, y0: e.y0, y1: e.y1, dur: 0.6 }); fx.text(e.x, e.y1 - 40, '퇴장!', '#ff3b4f', 20, 1.1); fx.addShake(5); break;
      case 'squint': this.add('squint', { h: g.heroes.find((o) => o.id === e.hero), list: e.list, dur: 0.9 }); break;
      case 'skyBolt': { // 실눈 저격: 하늘에서 굵은 욕 벼락 (빛 세 겹 · 곁가지 · 땅 충격) — 이미 얼어 있으면 하늘색
        const rm = rmOn();
        this.add('skybolt', { x: e.x, y: e.y, frozen: e.frozen, dur: 0.5, seed: Math.random() * 99, rm });
        fx.flash(e.frozen ? '#d8f6ff' : '#e0c8ff', rm ? 0.06 : 0.14); if (!rm) fx.addShake(4);
        const n = busy || rm ? 4 : 9, col = e.frozen ? '#e8fbff' : '#f0c8ff';
        for (let i = 0; i < n; i++) { const a = -Math.PI * rnd(0.05, 0.95), s = rnd(120, 260); fx.part('spark', e.x, e.y + 8, Math.cos(a) * s, Math.sin(a) * s, rnd(0.25, 0.45), rnd(2.5, 3.5), i % 3 ? col : '#ffffff', { drag: 2.5, grav: 300 }); }
        break;
      }
      case 'shatter': { // 언 진상에 벼락 → 얼음이 산산조각: 폭발 그림 · 조각 · 서리 고리
        const rm = rmOn(), few = busy || rm;
        this.add('iceburst', { x: e.x, y: e.y, s: Math.max(90, e.r * 2.4), dur: 0.42, rot: Math.random() * TAU });
        this.iceShards(e.x, e.y, few ? 5 : 11, 260, -140);
        fx.ring(e.x, e.y, 8, e.r, 0.4, '#bff4ff', 4); if (!rm) fx.addShake(5);
        fx.text(e.x, e.y - 34, '와장창!', '#dff8ff', 15, 0.8);
        break;
      }
      case 'encore': this.add('mirror', { x: e.x, y: e.y, r: e.r, hx: e.hx, hy: e.hy, dur: 3.4 }); break;
      case 'harley': if (e.drift) this.add('vroom', { x: e.x, y: e.y, tx: e.tx, ty: e.ty, dur: 0.35 }); break;
      case 'driftEnd': fx.burst(e.x, e.y, 10, 'rgba(200,200,210,0.8)', 120, 'puff', 10, 0.6); break;
      case 'tapeUp': this.add('tapefly', { x: e.x, y: e.y, w: e.w, hx: e.hx, hy: e.hy, dur: 0.35 }); fx.banner('붕대 바리케이드!', '여기서부터 못 지나간다', '#2e8a55', 1.0, 'wave'); break;
      case 'tapeBreak': fx.burst(e.x, e.y, 14, '#ffffff', 160, 'shard', 4, 0.5, 300); fx.text(e.x, e.y - 20, '붕대 끊어짐!', '#ffd0d0', 12, 0.8); break;
      case 'danceFloor': fx.banner('스핀 스포트라이트!', '박자마다 리본으로 휘감기 · 마지막에 피루엣', '#8a3ac0', 1.0, 'wave'); break;
      case 'beat': if (e.kind === 'floor') { fx.ring(e.x, e.y, e.r * 0.2, e.r, 0.35, e.last ? '#ffffff' : '#e3b8ff', e.last ? 6 : 3); if (e.last) { fx.addShake(5); fx.text(e.x, e.y - e.r * 0.6, '피루엣!', '#ffe6ff', 18, 0.9); } } break;
      case 'diveUp': { // 박나영 급강하: 박나뇽이 하늘로 솟구친다 → (그림자 예고) → 표적으로 내리꽂힘 — 시간은 sim 장판(z.t)에 맞춘다 (×2 배속에서도 딱 맞게)
        const z = (g.zones || []).filter((q) => q.kind === 'dive' && Math.abs(q.x - e.tx) < 0.5 && Math.abs(q.y - e.ty) < 0.5).pop() || null;
        const h = z && z.hero ? z.hero : g.heroes.find((q) => q.id === 'dragon');
        this.add('dive', { h, z, x: e.x, y: e.y + 24, tx: e.tx, ty: e.ty, r: e.r, dur: 4, rm: rmOn() });
        if (!busy) for (let i = 0; i < 6; i++) { const a = Math.PI + (i / 5) * Math.PI; fx.part('puff', e.x + Math.cos(a) * 14, e.y + 26, Math.cos(a) * 70, -10 - Math.random() * 20, 0.5, 7, 'rgba(225,210,190,0.75)', { drag: 3 }); } // 날갯짓 흙먼지
        fx.ring(e.x, e.y + 26, 6, 40, 0.35, '#ffd9a0', 3);
        break;
      }
      case 'diveLand': { // 쾅: 섬광 · 충격파 · 불덩이 · 바깥으로 튀는 불꽃 혀 · 파편 · 불티 · 연기 (불꽃 고리는 장판 fire ring)
        const rm = rmOn(), few = busy || rm;
        this.add('boomg', { x: e.x, y: e.y, r: e.r, dur: 0.75, rm });
        this.add('boom', { x: e.x, y: e.y, r: e.r, dur: 0.7, rm, seed: Math.random() * TAU });
        fx.flash('#ffd9a0', rm ? 0.08 : 0.18); if (!rm) fx.addShake(7);
        fx.text(e.x, e.y - 30, '쾅!!', '#ffd23f', 20, 0.9);
        for (let i = 0; i < (few ? 5 : 11); i++) { const a = -Math.PI * Math.random(), s = rnd(140, 300); fx.part('shard', e.x + rnd(-10, 10), e.y, Math.cos(a) * s, Math.sin(a) * s * 1.1 - 60, rnd(0.5, 0.8), rnd(4, 7), i % 3 ? '#5a3a24' : '#8a6a4a', { grav: 820, drag: 0.6 }); } // 땅 파편
        for (let i = 0; i < (few ? 6 : 16); i++) { const a = Math.random() * TAU, s = rnd(120, 280); fx.part('ember', e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 5, Math.cos(a) * s, Math.sin(a) * s * 0.55 - 80, rnd(0.45, 0.9), rnd(1.6, 2.6), null, { grav: -60, drag: 2.2 }); } // 불티
        if (!few) for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; fx.part('smoke', e.x + Math.cos(a) * e.r * 0.5, e.y + Math.sin(a) * e.r * 0.22 - 10, Math.cos(a) * 30, -28 - Math.random() * 20, rnd(0.9, 1.3), rnd(14, 20), null, { drag: 1.2 }); }
        const h = g.heroes.find((q) => q.id === 'dragon' && !q.gone);
        if (h && !(g.zones || []).some((q) => q.kind === 'dive' && q.hero === h && q.t > 0)) { h._diveHomeT = this.now() + 0.42; this.add('divehome', { h, x: e.x, y: e.y, dur: 0.42 }); } // 쌍둥이 급강하가 남았으면 아직 안 돌아간다
        break;
      }
      case 'jumpUp': this.add('ramp', { x: e.x, y: e.y, tx: e.tx, ty: e.ty, r: e.r, dur: e.air || 0.7 }); break;
      case 'jumpLand': fx.ring(e.x, e.y, 10, e.r * 1.3, 0.45, '#bfe8ff', 6); fx.burst(e.x, e.y, busy ? 6 : 16, '#ffffff', 220, 'puff', 8, 0.55); fx.addShake(7); fx.text(e.x, e.y - 34, '팬클럽 총출동!', '#7ad0ff', 16, 0.9); fx.banner('총출동 5초!', '마음껏 탭해서 타세요 · 지나간 길은 빙판', '#2f8ac8', 0.9, 'wave'); break;
      case 'boardChain': fx.text(e.x, e.y, `콤보 ${e.n}!`, '#7ad0ff', 13 + Math.min(6, e.n), 0.8); break;
      case 'boardDash': if (e.perfect) { fx.text(e.x, e.y - 70, '퍼펙트!', '#ffe14d', 17, 0.9); fx.ring(e.x, e.y - 10, 6, 46, 0.35, '#ffe14d', 4); } break;
      case 'boardEmpty': if (!busy) fx.text(e.x, e.y, '보드 충전 중…', '#cfe3ff', 11, 0.7); break;
      case 'boardCharge': break;
      case 'bossSkill': if (e.boss === 'boss_bestman') { // 8-10 신랑 친구 대표: 기술마다 눈에 보이는 연출
        if (e.kind === 'stun') { // 건배 제의: 머리 위 샴페인 잔 번쩍 → 금빛 거품 · "건배!" → 표적 멤버에게 샴페인이 터진다
          this.add('toast', { x: e.x, y: e.y - 110, dur: 0.9 }); fx.bubble(e.x, e.y - 150, '건배!');
          for (const q of e.hits || []) { this.add('champ', { x: e.x, y: e.y - 100, tx: q.x, ty: q.y - 40, dur: 0.9 }); }
        } else if (e.kind === 'slow') { // 한 말씀만 더…: 마이크에서 음파 고리 → 멤버마다 회색 두루마리가 칭칭 · "Zzz…"
          for (let i = 0; i < 3; i++) this.add('speechRing', { x: e.x, y: e.y - 40, dur: 0.9, delay: i * 0.18 });
          for (const h of g.heroes) { if (h.def.summon) continue; this.add('scroll', { h, dur: e.sec || 4 }); }
          fx.bubble(e.x, e.y - 150, '한 말씀만 더…'); if (g.heroes[0]) fx.text(g.heroes[0].x, g.heroes[0].y - 100, 'Zzz…', '#d8d8e8', 14, 1.4);
        } else if (e.kind === 'summon' && e.carpet) { this.add('carpet', { x: e.carpet.x, y0: e.carpet.y0, y1: e.carpet.y1, dur: 3 }); fx.bubble(e.x, e.y - 150, '친구들 무대로!'); }
      } break;
      case 'skill': if (e.skill === 'winkbomb') this.add('wink', { x: e.x, y: e.y, r: e.r || 130, dur: 1.0 }); if (e.skill === 'firstaid') for (const h of g.heroes) this.add('aid', { h, dur: 1.1 }); if (e.skill === 'rally') this.add('flag', { h: g.heroes.find((o) => o.id === e.hero), dur: 1.2 }); break;
    }
    return false;
  }

  draw(layer, g) {
    if (g !== this.g) { this.list.length = 0; this.g = g; }
    const now = this.now();
    if (layer === 'ground') { this.drawZones(g, now); this.drawRings(g, now); }
    if (layer === 'mid') this.drawStatus(g, now);
    for (const o of this.list) {
      const k = (now - o.t0) / o.dur;
      if (k < 0 || k > 1) continue;
      const f = this['d_' + o.kind];
      if (f && f.layer === layer) f.call(this, o, k, g, now);
    }
    if (layer === 'top') this.list = this.list.filter((o) => now - o.t0 <= o.dur);
    this.R.world(); this.cx.globalAlpha = 1; this.cx.globalCompositeOperation = 'source-over';
  }

  // ── 장판 (g.zones) ──
  drawZones(g, now) {
    if (!g.zones || !g.zones.length) return;
    const cx = this.cx, R = this.R;
    for (const z of g.zones) {
      const age = z.max - z.t, k = c01(age / z.max), fade = c01(z.t / 0.35) * c01(age / 0.15);
      if (z.kind === 'clock') { // 오지은: 바닥 시계 (납작) · 째깍 바늘
        const up = c01(age / (z.delay || 0.28));
        R.tf(z.x, z.y + 6, 0, 1, 0.45); cx.globalAlpha = 0.85 * fade;
        cx.fillStyle = 'rgba(60,30,110,0.45)'; cx.beginPath(); cx.arc(0, 0, z.r * up, 0, TAU); cx.fill();
        cx.strokeStyle = '#d6c2ff'; cx.lineWidth = 3; cx.stroke();
        for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; cx.beginPath(); cx.moveTo(Math.cos(a) * z.r * 0.78 * up, Math.sin(a) * z.r * 0.78 * up); cx.lineTo(Math.cos(a) * z.r * 0.92 * up, Math.sin(a) * z.r * 0.92 * up); cx.stroke(); }
        const ha = -Math.PI / 2 + Math.floor(now * 2) * (TAU / 12); cx.lineWidth = 4; cx.strokeStyle = '#fff'; cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(Math.cos(ha) * z.r * 0.7 * up, Math.sin(ha) * z.r * 0.7 * up); cx.stroke();
      } else if (z.kind === 'fire') { // 박나영: 불 바닥 · 급강하 불꽃 고리 (그을린 자국 + 일렁이는 불빛 + 불꽃 혀)
        this.drawFireZone(z, now, fade, age);
      } else if (z.kind === 'iceline') { // 송바울 총출동: 지나간 길이 빙판
        R.world(); cx.globalAlpha = 0.7 * fade; cx.lineCap = 'round';
        cx.strokeStyle = 'rgba(190,235,255,0.55)'; cx.lineWidth = z.w * 2; cx.beginPath(); cx.moveTo(z.x, z.y + 8); cx.lineTo(z.x2, z.y2 + 8); cx.stroke();
        cx.strokeStyle = 'rgba(255,255,255,0.9)'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(z.x, z.y + 8); cx.lineTo(z.x2, z.y2 + 8); cx.stroke();
      } else if (z.kind === 'skid') { // 백인규 타이어 자국 · 송바울 눈길
        R.tf(z.x, z.y + 6, 0, 1, 0.5); cx.globalAlpha = 0.6 * fade; cx.strokeStyle = z.snow ? 'rgba(235,248,255,0.9)' : 'rgba(25,20,20,0.85)'; cx.lineWidth = 5;
        for (const rr of [0.55, 0.75, 0.92]) { cx.beginPath(); cx.arc(0, 0, z.r * rr, rr * 3, rr * 3 + TAU * 0.8); cx.stroke(); }
      } else if (z.kind === 'tape') { // 홍정민 붕대 바리케이드
        const w = z.w, sw = Math.min(1, age / 0.3);
        R.tf(z.x, z.y, Math.sin(now * 3 + z.x) * 0.01, 1, 1); cx.globalAlpha = fade;
        cx.fillStyle = 'rgba(0,0,0,0.25)'; cx.fillRect(-w / 2 * sw, 4, w * sw, 8);
        cx.fillStyle = '#f7f3ea'; cx.fillRect(-w / 2 * sw, -10, w * sw, 14); cx.strokeStyle = '#c9c1ae'; cx.lineWidth = 1.5; cx.strokeRect(-w / 2 * sw, -10, w * sw, 14);
        cx.strokeStyle = 'rgba(180,170,150,0.9)'; cx.beginPath(); for (let x = -w / 2; x < w / 2 * sw; x += 9) { cx.moveTo(x, -10); cx.lineTo(x + 6, 4); } cx.stroke();
        cx.fillStyle = '#e04a4a'; for (const sx of [-w / 2 + 8, w / 2 - 8]) { cx.fillRect(sx * sw - 2, -8, 4, 10); cx.fillRect(sx * sw - 5, -5, 10, 4); } // 양 끝 빨간 십자
        cx.fillStyle = 'rgba(0,0,0,0.5)'; cx.fillRect(-20, -20, 40, 5); cx.fillStyle = '#7be38f'; cx.fillRect(-20, -20, 40 * c01(z.hp / Math.max(1, z.hp0 || (z.hp0 = z.hp))), 5);
      } else if (z.kind === 'floor') { // 임수빈 댄스 플로어: 빙글빙글 도는 체크 무늬 원판 (3D 납작) · 스포트라이트는 top 층
        R.tf(z.x, z.y + 4, 0, 1, 0.42); cx.globalAlpha = 0.85 * fade;
        const rot = now * 1.8, n = 12;
        for (let i = 0; i < n; i++) { const a0 = rot + (i / n) * TAU, a1 = a0 + TAU / n; cx.fillStyle = i % 2 ? 'rgba(255,120,230,0.55)' : 'rgba(150,110,255,0.55)'; cx.beginPath(); cx.moveTo(0, 0); cx.arc(0, 0, z.r, a0, a1); cx.closePath(); cx.fill(); }
        cx.strokeStyle = '#fff'; cx.lineWidth = 3; cx.beginPath(); cx.arc(0, 0, z.r, 0, TAU); cx.stroke();
        cx.globalCompositeOperation = 'lighter'; cx.fillStyle = 'rgba(255,255,255,0.25)'; cx.beginPath(); cx.arc(0, 0, z.r * (0.3 + 0.2 * Math.sin(now * 12)), 0, TAU); cx.fill(); cx.globalCompositeOperation = 'source-over';
      } else if (z.kind === 'fuse') { // 최은옥 시한폭탄: 바닥에 꽂힌 병 · 지글지글 심지 · 남은 시간 고리
        R.tf(z.x, z.y, 0.3, 1, 1); cx.globalAlpha = 1;
        cx.fillStyle = z.p && z.p.fire ? '#ff6a3a' : '#5fd27a'; cx.fillRect(-4, -16, 8, 18); cx.fillRect(-2, -22, 4, 6);
        R.tf(z.x, z.y + 4, 0, 1, 0.45); cx.strokeStyle = '#ffd23f'; cx.lineWidth = 3; cx.beginPath(); cx.arc(0, 0, 18, -Math.PI / 2, -Math.PI / 2 + TAU * c01(z.t / z.max)); cx.stroke();
        if (Math.random() < 0.6) this.fx.part('spark', z.x + 6, z.y - 22, (Math.random() - 0.5) * 60, -40 - Math.random() * 40, 0.25, 3, '#ffd23f');
      } else if (z.kind === 'dive') { // 박나영 급강하 예고: 커지는 그림자 · 빨라지는 경고 고리 · 도는 점선 · 모여드는 화살표
        this.drawDiveMark(z, now, k);
      } else if (z.kind === 'drift') { // 백인규 할리 드리프트: 원을 그리며 도는 할리 + 연기 고리
        const el = z.max - z.t; if (el < z.go) continue;
        const a = (el - z.go) * 9;
        R.tf(z.x, z.y + 6, 0, 1, 0.45); cx.globalAlpha = 0.5; cx.strokeStyle = 'rgba(210,210,220,0.8)'; cx.lineWidth = 10; cx.beginPath(); cx.arc(0, 0, z.r * 0.75, a - 2.2, a); cx.stroke();
        const bx = z.x + Math.cos(a) * z.r * 0.75, by = z.y + Math.sin(a) * z.r * 0.75 * 0.45, bike = R.images.ingyuBike;
        R.tf(bx, by, 0, Math.cos(a) > 0 ? -1 : 1, 1); cx.globalAlpha = 1;
        if (imgOk(bike)) cx.drawImage(bike, -30, -40, 60, 60); else { cx.fillStyle = '#3f8cff'; cx.fillRect(-18, -14, 36, 16); cx.fillStyle = '#222'; cx.beginPath(); cx.arc(-12, 4, 7, 0, TAU); cx.arc(12, 4, 7, 0, TAU); cx.fill(); }
        if (Math.random() < 0.5) this.fx.part('puff', bx, by + 8, (Math.random() - 0.5) * 40, -20, 0.5, 9, 'rgba(220,220,230,0.7)');
      }
    }
  }
  // 박나영 불 바닥 (z.ring = 급강하 불꽃 고리): 그을린 자국 · 일렁이는 불빛 · 깊이 순서로 세운 불꽃 혀
  drawFireZone(z, now, fade, age) {
    const cx = this.cx, R = this.R, im = R.images.dr_flame, gf = R.projSprites.glowFire, rm = rmOn();
    const seed = z._seed || (z._seed = Math.random() * 100), up = eOut(c01(age / 0.3)), fl = rm ? 1 : 0.85 + 0.15 * Math.sin(now * 13 + seed) * Math.sin(now * 7.3 + seed * 2);
    R.tf(z.x, z.y + 6, 0, 1, 0.45); cx.globalAlpha = 0.55 * fade;
    const sc = cx.createRadialGradient(0, 0, z.ring ? z.r * 0.55 : 0, 0, 0, z.r * 1.08);
    sc.addColorStop(0, z.ring ? 'rgba(45,14,6,0)' : 'rgba(45,14,6,0.75)'); sc.addColorStop(0.7, 'rgba(35,12,6,0.45)'); sc.addColorStop(1, 'rgba(30,10,5,0)');
    cx.fillStyle = sc; cx.beginPath(); cx.arc(0, 0, z.r * 1.08, 0, TAU); cx.fill(); // 그을린 자국
    if (gf) { cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = (z.ring ? 0.42 : 0.6) * fade * fl * up; const rr = z.r * 1.35; cx.drawImage(gf.c, -rr, -rr, rr * 2, rr * 2); cx.globalCompositeOperation = 'source-over'; } // 일렁이는 불빛
    if (z.ring) { cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.55 * fade * fl; cx.strokeStyle = 'rgba(255,140,40,0.9)'; cx.lineWidth = 6; cx.beginPath(); cx.arc(0, 0, z.r * 0.92, 0, TAU); cx.stroke(); cx.strokeStyle = 'rgba(255,230,160,0.9)'; cx.lineWidth = 2; cx.stroke(); cx.globalCompositeOperation = 'source-over'; } // 달아오른 고리 선
    if (!imgOk(im)) { cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.6 * fade; cx.fillStyle = 'rgba(255,120,30,0.5)'; cx.beginPath(); cx.arc(0, 0, z.r, 0, TAU); cx.fill(); cx.globalCompositeOperation = 'source-over'; return; }
    if (!z._pts) { // 불꽃 혀 자리 (한 번 정해 두고 다시 쓴다) — 뒤(위)부터 그리게 정렬
      const n = z.ring ? (rm ? 9 : 16) : (rm ? 4 : 7), pts = [];
      for (let i = 0; i < n; i++) {
        let a, d; if (z.ring) { a = (i / n) * TAU + rnd(-0.12, 0.12); d = z.r * rnd(0.86, 0.98); } else { a = Math.random() * TAU; d = z.r * Math.sqrt(Math.random()) * 0.78; }
        pts.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.45, s: rnd(0.75, 1.2), ph: Math.random() * 8, sp: rnd(12, 17) });
      }
      z._pts = pts.sort((p, q) => p.dy - q.dy);
    }
    const fw = im.naturalWidth / 8, fh = im.naturalHeight, H0 = z.ring ? Math.min(40, z.r * 0.42) : Math.min(40, z.r * 0.9);
    for (const p of z._pts) {
      const hgt = H0 * p.s * up * (0.82 + 0.18 * Math.sin(now * 6 + p.ph * 3)) * (0.6 + 0.4 * fade), fi = Math.floor(now * p.sp + p.ph) % 8;
      R.tf(z.x + p.dx, z.y + 6 + p.dy, 0, 1, 1); cx.globalAlpha = Math.min(1, fade * 1.4);
      cx.drawImage(im, fi * fw, 0, fw, fh, -hgt * 0.33, -hgt * 0.96, hgt * 0.67, hgt);
    }
    if (!rm && Math.random() < (z.ring ? 0.45 : 0.22) * fade) { const p = z._pts[(Math.random() * z._pts.length) | 0]; this.fx.part('ember', z.x + p.dx, z.y + p.dy - 10, rnd(-20, 20), rnd(-120, -60), rnd(0.5, 0.9), rnd(1.4, 2.2), null, { drag: 1.5 }); }
    if (!rm && Math.random() < 0.05 * fade) this.fx.part('smoke', z.x + rnd(-z.r, z.r) * 0.6, z.y - 20, rnd(-8, 8), -30, 1.1, 10, null, { drag: 0.8 });
  }
  // 박나영 급강하 예고 (바닥): 떨어질수록 진해지는 그림자 · 빨라지는 경고 고리 · 모여드는 화살표 · 끝에 달아오르는 바닥
  drawDiveMark(z, now, k) {
    const cx = this.cx, R = this.R, r = z.r, rm = rmOn(), sh = 0.2 + 0.8 * k * k;
    R.tf(z.x, z.y + 6, 0, 1, 0.45);
    const gr = cx.createRadialGradient(0, 0, 0, 0, 0, r * 0.8 * sh + 1); gr.addColorStop(0, 'rgba(20,6,0,0.7)'); gr.addColorStop(1, 'rgba(20,6,0,0)');
    cx.globalAlpha = 0.35 + 0.55 * k; cx.fillStyle = gr; cx.beginPath(); cx.arc(0, 0, r * 0.8 * sh + 1, 0, TAU); cx.fill();
    cx.globalCompositeOperation = 'lighter';
    const hot = cx.createRadialGradient(0, 0, 0, 0, 0, r); hot.addColorStop(0, 'rgba(255,90,20,0)'); hot.addColorStop(0.75, `rgba(255,90,20,${0.08 + 0.3 * k * k})`); hot.addColorStop(1, 'rgba(255,60,10,0)');
    cx.globalAlpha = 1; cx.fillStyle = hot; cx.beginPath(); cx.arc(0, 0, r, 0, TAU); cx.fill();
    const pulse = rm ? 0.6 : 0.5 + 0.5 * Math.sin(now * (9 + 22 * k));
    cx.globalAlpha = 0.55 + 0.45 * pulse; cx.strokeStyle = '#ff4a1e'; cx.lineWidth = 3 + 3 * pulse; cx.beginPath(); cx.arc(0, 0, r, 0, TAU); cx.stroke();
    cx.strokeStyle = '#ffe2a0'; cx.lineWidth = 1.5; cx.stroke();
    cx.globalAlpha = 0.75; cx.strokeStyle = '#ffb05a'; cx.lineWidth = 3; cx.setLineDash([12, 10]); cx.lineDashOffset = rm ? 0 : -now * 70; cx.beginPath(); cx.arc(0, 0, r * 0.8, 0, TAU); cx.stroke(); cx.setLineDash([]); cx.lineDashOffset = 0;
    const d = r * (1.32 - 0.36 * eOut(k)); cx.fillStyle = '#ff6a2a'; cx.globalAlpha = 0.9;
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4, c = Math.cos(a), sn = Math.sin(a); cx.beginPath(); cx.moveTo(c * d - sn * 9, sn * d + c * 9); cx.lineTo(c * (d - 14), sn * (d - 14)); cx.lineTo(c * d + sn * 9, sn * d - c * 9); cx.lineTo(c * (d - 5), sn * (d - 5)); cx.closePath(); cx.fill(); }
    cx.globalCompositeOperation = 'source-over';
  }
  // 화상: 몸에 붙은 불꽃 혀 (겹 수 = 불꽃 수 · 3겹부터 더 크고 밝게) · 가끔 불티
  drawBurn(e, sz, now, many) {
    const cx = this.cx, R = this.R, im = R.images.dr_flame, gf = R.projSprites.glowFire, stk = e.burnN || 1, fade = c01(e.burnT / 0.35);
    if (!imgOk(im)) { if (Math.random() < (many ? 0.12 : 0.35)) this.fx.part('flame', e.x + (Math.random() - 0.5) * sz * 0.5, e.y - Math.random() * sz * 0.4, 0, -60, 0.35, 6 + stk * 2, '#ff9a3a'); return; }
    const seed = e._bseed || (e._bseed = Math.random() * 8), n = many ? 1 : Math.min(2, stk), fw = im.naturalWidth / 8, fh = im.naturalHeight;
    if (!many && gf) { R.tf(e.x, e.y - sz * 0.12, 0, 1, 0.9); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = (stk >= 3 ? 0.5 : 0.3) * fade * (0.85 + 0.15 * Math.sin(now * 17 + seed)); const rr = sz * (0.36 + 0.05 * Math.min(stk, 5)); cx.drawImage(gf.c, -rr, -rr, rr * 2, rr * 2); cx.globalCompositeOperation = 'source-over'; }
    const OFF = [[-0.17, 0.08], [0.19, 0.04]]; // 얼굴을 가리지 않게 허리 양옆
    for (let i = 0; i < n; i++) {
      const hgt = sz * (0.27 + 0.035 * Math.min(stk, 5)) * (i ? 0.8 : 1) * (0.6 + 0.4 * fade), fi = Math.floor(now * 15 + seed + i * 2.7) % 8;
      R.tf(e.x + OFF[i][0] * sz, e.y + OFF[i][1] * sz, 0, 1, 1); cx.globalAlpha = 0.9 * fade;
      cx.drawImage(im, fi * fw, 0, fw, fh, -hgt * 0.33, -hgt, hgt * 0.67, hgt);
    }
    if (!many && Math.random() < 0.05 + 0.03 * stk) this.fx.part('ember', e.x + rnd(-0.2, 0.2) * sz, e.y - sz * 0.3, rnd(-15, 15), rnd(-90, -50), 0.6, 1.6, null, { drag: 1 });
  }
  // 김도훈 음파 고리 (도넛이 퍼진다)
  drawRings(g, now) {
    if (!g.rings || !g.rings.length) return;
    const cx = this.cx, R = this.R;
    for (const q of g.rings) {
      const k = c01(q.t / q.T);
      R.tf(q.x, q.y + 30, 0, 1, 0.5); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.75 * (1 - k * 0.6);
      cx.strokeStyle = '#c9a3ff'; cx.lineWidth = 10 * (1 - k * 0.5); cx.beginPath(); cx.arc(0, 0, Math.max(1, q.r), 0, TAU); cx.stroke();
      cx.strokeStyle = '#ffffff'; cx.lineWidth = 2; cx.beginPath(); cx.arc(0, 0, Math.max(1, q.r - 3), 0, TAU); cx.stroke();
      cx.globalCompositeOperation = 'source-over';
      if (Math.random() < 0.3) { const a = Math.random() * TAU; this.fx.part('note', q.x + Math.cos(a) * q.r, q.y + 30 + Math.sin(a) * q.r * 0.5 - 20, 0, -40, 0.6, 10, '#d9c2ff'); }
    }
  }
  // ── 서명훈 얼음 ──
  //  쌓이는 서리(1~2겹): 발밑에서 얼음 조각이 겹마다 자라고 몸에 차가운 빛 · 머리 위 ◆◆◇ 표시
  //  꽁꽁(빙결): 그린 얼음 블록이 톡 솟아 진상을 가둔다 → 빛 띠가 쓱 지나감 · 서리 반짝 → 녹기 직전 금 · 떨림 → 깨지며 조각
  iceShards(x, y, n, sp, up) {
    for (let i = 0; i < n; i++) { const a = rnd(0, TAU), s = rnd(0.4, 1) * sp; const p = this.fx.part('iceshard', x + rnd(-8, 8), y + rnd(-10, 6), Math.cos(a) * s, Math.sin(a) * s * 0.8 + up, rnd(0.45, 0.75), rnd(12, 20), (Math.random() * 12) | 0, { grav: 620, drag: 0.8 }); if (p) p.vr = rnd(-14, 14); }
  }
  iceBreak(x, y, sz, few) {
    this.add('iceburst', { x, y, s: sz * 1.5, dur: 0.34, rot: Math.random() * TAU });
    this.iceShards(x, y, few ? 3 : 7, 190, -150);
  }
  drawIce(e, sz, now, many, rm) {
    const cx = this.cx, R = this.R, feet = e.y + sz * 0.3, frozen = e.frozenT > 0 && e.stunT > 0;
    if (!frozen) { if (e._kfFrz) { e._kfFrz = false; this.iceBreak(e.x, feet - sz * 0.45, sz, many || rm); } } else if (!e._kfFrz) { e._kfFrz = true; e._kfFrzAt = now; }
    const blk = R.images.vfx_ice_block, sh = R.images.vfx_ice_shards, gi = gIce();
    if (frozen) {
      const t = now - e._kfFrzAt, left = Math.min(e.frozenT, e.stunT), pop = t < 0.22 ? Math.max(0.05, eBack(t / 0.22)) : 1;
      const wob = left < 0.4 && !rm ? Math.sin(now * 70) * 1.4 : 0, S = sz * 2.05;
      if (gi) { R.tf(e.x, e.y - sz * 0.05, 0, 1, 1.25); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.35 + (t < 0.25 ? (1 - t / 0.25) * 0.6 : 0); const r = sz * 0.62; cx.drawImage(gi, -r, -r, r * 2, r * 2); cx.globalCompositeOperation = 'source-over'; } // 몸에 차가운 빛 (막 얼 때 번쩍)
      if (imgOk(blk)) { R.tf(e.x + wob, feet + 2, 0, 0.6 + 0.4 * pop, pop); cx.globalAlpha = 0.96; cx.drawImage(blk, -S / 2, -S * 0.81, S, S); } else { R.tf(e.x + wob, feet, 0, 1, pop); cx.globalAlpha = 0.45; cx.fillStyle = '#bff2ff'; cx.fillRect(-sz * 0.38, -sz * 0.95, sz * 0.76, sz * 0.9); }
      if (!rm && t > 0.2) { // 빛 띠가 블록 위를 비스듬히 쓱 (1.7초마다)
        const ph = ((now + (e.phase || 0)) % 1.7) / 1.7, band = gBand();
        if (ph < 0.3 && band) { const q = ph / 0.3, bw = S * 0.36, bh = S * 0.6; R.tf(e.x + wob, feet - S * 0.45, 0, 1, 1); cx.save(); cx.beginPath(); cx.rect(-bw / 2, -bh / 2, bw, bh); cx.clip(); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.55 * Math.sin(q * Math.PI); cx.rotate(-0.6); cx.drawImage(band, -bw * 1.2 + q * bw * 2.4 - 10, -bh, 20, bh * 2); cx.restore(); }
      }
      if (left < 0.45 && t > 0.2) { // 녹기 직전: 금이 쩍쩍
        const q = c01((0.45 - left) / 0.45), L = S * 0.25 * q; R.tf(e.x + wob, feet - S * 0.42, 0, 1, 1); cx.globalAlpha = 0.9; cx.strokeStyle = '#ffffff'; cx.lineWidth = 1.6; cx.lineCap = 'round';
        cx.beginPath(); cx.moveTo(-S * 0.1, -S * 0.12); cx.lineTo(-S * 0.1 + L * 0.3, -S * 0.12 + L * 0.45); cx.lineTo(-S * 0.1 + L * 0.1, -S * 0.12 + L * 0.8); cx.moveTo(S * 0.08, S * 0.02); cx.lineTo(S * 0.08 - L * 0.35, S * 0.02 - L * 0.3); cx.lineTo(S * 0.08 - L * 0.2, S * 0.02 - L * 0.7); cx.stroke();
      }
      if (!many && !rm && Math.random() < 0.05) this.fx.part('spark', e.x + rnd(-sz * 0.35, sz * 0.35), feet - rnd(sz * 0.2, sz * 1.1), 0, -18, 0.5, 2.2, '#f0fdff'); // 서리 반짝
      cx.globalAlpha = 1;
      return;
    }
    if (!(e.iceT > 0 && e.iceN > 0)) return;
    const n = Math.min(ICE_NEED - 1, e.iceN | 0), fade = c01(e.iceT / 0.5);
    if (e._kfIceN !== n) { if (n > (e._kfIceN | 0)) e._kfIceAt = now; e._kfIceN = n; }
    const grow = c01((now - (e._kfIceAt || 0)) / 0.16), kk = n / Math.max(1, ICE_NEED - 1);
    if (gi) { // 발밑 서리 · 몸에 냉기
      cx.globalCompositeOperation = 'lighter'; R.tf(e.x, feet - 2, 0, 1, 0.32); cx.globalAlpha = (0.35 + 0.3 * kk) * fade; let r = sz * (0.45 + 0.15 * kk); cx.drawImage(gi, -r, -r, r * 2, r * 2);
      R.tf(e.x, e.y - sz * 0.08, 0, 1, 1.2); cx.globalAlpha = 0.16 * n * fade; r = sz * 0.5; cx.drawImage(gi, -r, -r, r * 2, r * 2); cx.globalCompositeOperation = 'source-over';
    }
    if (imgOk(sh)) { // 발밑에서 얼음 조각이 자란다 (겹마다 2개씩 · 막 쌓인 겹은 톡)
      const fh = sh.naturalHeight, spots = [[-0.24, -0.35, 0], [0.24, 0.35, 11], [-0.08, -0.12, 8], [0.1, 0.15, 0]];
      for (let i = 0; i < Math.min(spots.length, n * 2); i++) {
        const [ox, rot, fi] = spots[i], last = i >= (n - 1) * 2, gsc = last ? Math.max(0.05, eBack(grow)) : 1, s0 = sz * (0.2 + 0.06 * n) * gsc;
        R.tf(e.x + ox * sz, feet + 3, rot, 1, 1); cx.globalAlpha = 0.95 * fade; cx.drawImage(sh, fi * fh, 0, fh, fh, -s0 / 2, -s0 * 0.92, s0, s0);
      }
    }
    const top = feet - sz * 1.0, w = 9; // 머리 위 얼음 겹 표시 ◆◆◇ (꽉 차면 꽁꽁)
    for (let i = 0; i < ICE_NEED; i++) {
      const on = i < n, x = e.x + (i - (ICE_NEED - 1) / 2) * w, pp = on && i === n - 1 ? Math.max(0.05, eBack(grow)) : 1;
      R.tf(x, top - 4, Math.PI / 4, pp, pp); cx.globalAlpha = fade;
      cx.fillStyle = on ? '#bff6ff' : 'rgba(10,30,60,0.6)'; cx.strokeStyle = on ? '#ffffff' : 'rgba(170,230,255,0.8)'; cx.lineWidth = 1.2; cx.fillRect(-3, -3, 6, 6); cx.strokeRect(-3, -3, 6, 6);
    }
    cx.globalAlpha = 1;
  }
  // 진상 상태: 화상 불꽃 · 얼음 · 장미 송이 · 검열 띠 · 춤
  drawStatus(g, now) {
    const cx = this.cx, R = this.R, many = g.enemies.length > 60, rm = rmOn();
    for (const e of g.enemies) {
      if (e.dead) { if (e._kfFrz) { e._kfFrz = false; this.iceBreak(e.x, e.y - (e.def.size || 50) * 0.1, e.def.size || 50, many || rm); } continue; } // 언 채로 쓰러짐 → 깨짐
      const sz = e.def.size || 50, top = e.y - sz * 0.55;
      if (e.burnT > 0) this.drawBurn(e, sz, now, many);
      if (e.frozenT > 0 || e._kfFrz || (e.iceT > 0 && e.iceN > 0)) this.drawIce(e, sz, now, many, rm);
      if (e.roseT > 0 && e.roseN > 0) for (let i = 0; i < e.roseN; i++) { R.tf(e.x - 7 * (e.roseN - 1) / 2 + i * 7, top - 14, 0, 1, 1); cx.globalAlpha = 1; cx.fillStyle = '#ff3d6e'; cx.beginPath(); cx.arc(0, 0, 3.4, 0, TAU); cx.fill(); cx.fillStyle = '#2e9e4a'; cx.fillRect(-0.7, 3, 1.4, 4); }
      if (e.censorT > 0) { R.tf(e.x, e.y - sz * 0.42, 0, 1, 1); cx.globalAlpha = 0.92; cx.fillStyle = '#111'; cx.fillRect(-sz * 0.3, -5, sz * 0.6, 10); cx.fillStyle = '#ff4fb0'; cx.font = `900 8px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('검열', 0, 0.5); }
      if (e.danceT > 0 && !many && Math.random() < 0.06) this.fx.part('note', e.x + (Math.random() - 0.5) * 20, top, (Math.random() - 0.5) * 30, -40, 0.6, 9, '#ffb3f0');
      // (리본 묶기는 render.js 가 이미 그린다)
    }
    cx.globalAlpha = 1;
  }

  // 투사체 그림 (true = 여기서 다 그림)
  drawProj(p) {
    const cx = this.cx, R = this.R, now = this.now(), id = p.hero ? p.hero.id : '';
    switch (p.type) {
      case 'stamp': { // 운영진: 하늘에서 떨어지는 노란 경고 딱지 (떨어질수록 커짐 · 바닥 그림자)
        const k = c01(p.lt / p.T);
        R.tf(p.tx, p.ty + 6, 0, 1, 0.4); cx.globalAlpha = 0.25 + 0.4 * k; cx.fillStyle = 'rgba(0,0,0,0.6)'; cx.beginPath(); cx.arc(0, 0, p.splash * (0.4 + 0.6 * k), 0, TAU); cx.fill();
        R.tf(p.x, p.y, Math.sin(now * 12) * 0.25 * (1 - k), 0.7 + 0.5 * k, 0.7 + 0.5 * k); cx.globalAlpha = 1;
        const w = 18, h = 24; cx.fillStyle = p.big ? '#ff4040' : '#ffd23f'; cx.strokeStyle = '#3a2a00'; cx.lineWidth = 2; cx.fillRect(-w / 2, -h / 2, w, h); cx.strokeRect(-w / 2, -h / 2, w, h);
        cx.fillStyle = '#3a2a00'; cx.font = `900 13px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('!', 0, 1);
        return true;
      }
      case 'pistol': { // 건전남: 빠른 예광탄 (짧은 빛줄기)
        const v = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / v, uy = p.vy / v, L = p.big ? 34 : 24;
        R.world(); cx.globalCompositeOperation = 'lighter'; cx.lineCap = 'round';
        cx.strokeStyle = p.big ? 'rgba(255,80,60,0.9)' : 'rgba(255,240,170,0.85)'; cx.lineWidth = p.big ? 5 : 3; cx.beginPath(); cx.moveTo(p.x - ux * L, p.y - uy * L); cx.lineTo(p.x, p.y); cx.stroke();
        cx.fillStyle = '#ffffff'; cx.beginPath(); cx.arc(p.x, p.y, p.big ? 3.5 : 2.4, 0, TAU); cx.fill();
        cx.globalCompositeOperation = 'source-over';
        return true;
      }
      case 'rose': { // 박상화: 휘어 날아가는 장미 (꽃잎 꼬리)
        R.tf(p.x, p.y, Math.atan2(p.vy || 0, p.vx || 1), 1, 1); cx.globalAlpha = 1;
        cx.fillStyle = '#2e9e4a'; cx.fillRect(-16, -1, 14, 2);
        cx.fillStyle = '#e8204a'; cx.beginPath(); cx.arc(2, 0, 6, 0, TAU); cx.fill(); cx.fillStyle = '#ff6a8a'; cx.beginPath(); cx.arc(3, -1, 3, 0, TAU); cx.fill();
        if (Math.random() < 0.3) this.fx.part('dot', p.x, p.y, (Math.random() - 0.5) * 30, 20, 0.4, 3, '#ff5a7a');
        return true;
      }
      case 'bouquet': { // 임수빈: 나선으로 도는 리본 (앞으로 오면 크게 · 뒤로 가면 작고 어둡게)
        const d = p.depth === undefined ? 1 : p.depth, s = 0.85 + 0.3 * d, ang = Math.atan2(p.vy || 0, p.vx || 1);
        const tr = p._tr || (p._tr = []); tr.push(p.x, p.y); if (tr.length > 16) tr.splice(0, 2);
        R.world(); cx.globalAlpha = 0.8; cx.strokeStyle = d > 0 ? '#ff8ad8' : '#b27ae0'; cx.lineWidth = 3 * s; cx.lineCap = 'round'; cx.beginPath(); for (let i = 0; i < tr.length; i += 2) { if (!i) cx.moveTo(tr[i], tr[i + 1]); else cx.lineTo(tr[i], tr[i + 1]); } cx.stroke();
        R.tf(p.x, p.y, ang + now * 10, s, s * (0.5 + 0.5 * Math.abs(d))); cx.globalAlpha = 0.7 + 0.3 * d;
        cx.fillStyle = '#ff9be0'; cx.beginPath(); cx.ellipse(-6, 0, 7, 4, 0.4, 0, TAU); cx.ellipse(6, 0, 7, 4, -0.4, 0, TAU); cx.fill(); cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(0, 0, 2.6, 0, TAU); cx.fill();
        return true;
      }
      case 'mosaic': { // 여지원: 점멸 손 — 나타난 자리마다 모자이크 네모 · 사이엔 깜빡
        if (p.path === 'blink' && p.hop <= 0) return true; // 첫 칸(손을 떠나기 전)은 안 그린다 — 여지원 공격 띠의 모자이크 손과 얼굴 앞에서 겹쳐 두 개로 보였다
        if (p.path === 'blink') { const fl = (now * 20) % 1 < 0.5; if (!fl && p.hop < 3) return true; }
        R.tf(p.x, p.y, 0, 1, 1); cx.globalAlpha = 1; const im = R.images.w_mosaic;
        if (imgOk(im)) cx.drawImage(im, -14, -14, 28, 28); else { const cols = ['#f3c8a8', '#d89a7a', '#ff4fb0', '#2a1020']; for (let i = 0; i < 9; i++) { cx.fillStyle = cols[(i * 7 + (now * 10 | 0)) % 4]; cx.fillRect(-9 + (i % 3) * 6, -9 + ((i / 3) | 0) * 6, 6, 6); } }
        return true;
      }
      case 'dumbbell': if (!p.lob && id === 'ingyu') { R.tf(p.x, p.y + 12, 0, 1, 0.35); cx.globalAlpha = 0.35; cx.fillStyle = '#000'; cx.beginPath(); cx.arc(0, 0, p.r, 0, TAU); cx.fill(); if (Math.random() < 0.3) this.fx.part('puff', p.x, p.y + 10, (Math.random() - 0.5) * 30, 10, 0.4, 6, 'rgba(200,180,150,0.6)'); } return false; // 구르는 덤벨: 그림자 · 먼지 (덤벨 그림은 원래대로)
      case 'jab': { // 정원식: 짧게 뻗는 주먹 충격파 (초승달)
        if (id !== 'wonsik') return false;
        R.tf(p.x, p.y, Math.atan2(p.vy || 0, p.vx || 1), 1, 1); cx.globalAlpha = 0.9; cx.globalCompositeOperation = 'lighter';
        cx.strokeStyle = '#bff5bf'; cx.lineWidth = 4; cx.beginPath(); cx.arc(-6, 0, 13, -1.1, 1.1); cx.stroke(); cx.lineWidth = 2; cx.beginPath(); cx.arc(-14, 0, 10, -1, 1); cx.stroke();
        cx.globalCompositeOperation = 'source-over'; cx.fillStyle = '#f2c9a0'; cx.beginPath(); cx.arc(2, 0, 6, 0, TAU); cx.fill();
        return true;
      }
      case 'cane': if (p.path === 'loop' || p.turned !== undefined) { const tr = p._tr || (p._tr = []); tr.push(p.x, p.y); if (tr.length > 20) tr.splice(0, 2); R.world(); cx.globalAlpha = 0.45; cx.strokeStyle = '#e8c890'; cx.lineWidth = 4; cx.lineCap = 'round'; cx.beginPath(); for (let i = 0; i < tr.length; i += 2) { if (!i) cx.moveTo(tr[i], tr[i + 1]); else cx.lineTo(tr[i], tr[i + 1]); } cx.stroke(); cx.globalAlpha = 1; } return false; // 강성구: 고리 궤적
      case 'snack': if (Math.random() < 0.2) this.fx.part('dot', p.x, p.y, 0, 15, 0.35, 2.5, '#e8c070'); return false; // 문동한 과자 부스러기
    }
    return false;
  }
}

// ── 짧은 연출 (list) — 함수마다 그리는 층 ──
const P = KitFx.prototype;
const def = (name, layer, f) => { f.layer = layer; P['d_' + name] = f; };
def('stamp', 'ground', function (o, k) { // 운영진 딱지 쾅: 바닥에 노란 딱지 자국 + 고리
  const cx = this.cx; this.R.tf(o.x, o.y + 6, 0, 1, 0.45); cx.globalAlpha = 1 - k;
  cx.strokeStyle = '#ffd23f'; cx.lineWidth = 4; cx.beginPath(); cx.arc(0, 0, o.r * (0.6 + 0.4 * eOut(k)), 0, TAU); cx.stroke();
  cx.fillStyle = 'rgba(255,210,63,0.35)'; cx.fillRect(-12, -16, 24, 32);
});
def('ring', 'ground', function () {}); // (음파 고리는 g.rings 를 그대로)
def('chant', 'mid', function (o, k) { const h = o.h; if (!h) return; const cx = this.cx; this.R.tf(h.x, h.y + 18, 0, 1, 0.4); cx.globalAlpha = (1 - k) * 0.8; cx.strokeStyle = '#c9a3ff'; cx.lineWidth = 3; cx.beginPath(); cx.arc(0, 0, 20 + k * 30, 0, TAU); cx.stroke(); });
def('breath', 'mid', function (o, k, g, now) { // 박나영 불 뿜기: 박나뇽 입 → 실제 부채꼴 끝 (불빛 · 불길 띠 두 겹 · 입 섬광 · 불티 · 끝 연기)
  const cx = this.cx, R = this.R, h = o.h, im = R.images.dr_breath, gf = R.projSprites.glowFire;
  const m = h && h._mouth && !h.gone ? h._mouth : { x: o.x - 24, y: o.y + 38 };
  const ex = o.x + Math.cos(o.a) * o.r, ey = o.y + Math.sin(o.a) * o.r;
  const va = Math.atan2(ey - m.y, ex - m.x), L = Math.max(30, Math.hypot(ex - m.x, ey - m.y)), wEnd = Math.max(26, o.r * Math.tan(o.half));
  const grow = eOut(c01(k / 0.16)), fade = k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5, lead = k < 0.5 ? 0 : ((k - 0.5) / 0.5) * 0.45;
  const len = L * (0.3 + 0.75 * grow), fl = o.rm ? 1 : 0.88 + 0.12 * Math.sin(now * 53 + o.seed) * Math.sin(now * 31);
  const ca = Math.cos(va), sa = Math.sin(va);
  if (gf) { // 주변을 비추는 불빛 (일렁임)
    R.tf(m.x + ca * len * 0.55, m.y + sa * len * 0.55, va, 1, 1); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.32 * fade * fl;
    cx.drawImage(gf.c, -len * 0.7, -wEnd * 1.1, len * 1.4, wEnd * 2.2);
  }
  if (imgOk(im)) {
    const fw = im.naturalWidth / 8, fh = im.naturalHeight, fi = Math.floor(now * 22 + o.seed) % 8;
    const H = Math.min(2.08 * L * Math.tan(o.half), 360) * (0.55 + 0.45 * grow) * (1 + lead * 0.3), x0 = len * lead, w = len * 1.05 - x0 * 0.6; // 띠에서 불길이 가장 넓은 곳(80%) = 부채꼴 폭의 65% — 진상이 가려지지 않게
    R.tf(m.x, m.y, va, 1, 1);
    cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 0.9 * fade; cx.drawImage(im, fi * fw, 0, fw, fh, x0, -H / 2, w, H);
    cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.45 * fade * fl; cx.drawImage(im, ((fi + 3) % 8) * fw, 0, fw, fh, x0, -H * 0.25, w * 0.72, H * 0.5); // 뜨거운 심 (더하기)
  } else { // (그림이 아직 없을 때) 부채꼴 그라데이션
    R.world(); cx.globalCompositeOperation = 'lighter'; const gr = cx.createRadialGradient(m.x, m.y, 4, m.x, m.y, len); gr.addColorStop(0, `rgba(255,250,200,${0.9 * fade})`); gr.addColorStop(0.45, `rgba(255,170,40,${0.75 * fade})`); gr.addColorStop(1, 'rgba(255,60,0,0)');
    const vh = Math.atan2(wEnd, L); cx.fillStyle = gr; cx.beginPath(); cx.moveTo(m.x, m.y); cx.arc(m.x, m.y, len, va - vh, va + vh); cx.closePath(); cx.fill();
  }
  if (gf && k < 0.75) { R.tf(m.x, m.y, 0, 1, 1); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = (1 - k / 0.75) * 0.95; const rr = 15 + 5 * fl; cx.drawImage(gf.c, -rr, -rr, rr * 2, rr * 2); } // 입 섬광
  cx.globalCompositeOperation = 'source-over';
  if (!o.busy && k < 0.6 && Math.random() < (o.rm ? 0.2 : 0.75)) { // 불티: 불길 따라 날아가며 위로
    const d = len * rnd(0.2, 0.95), off = rnd(-0.75, 0.75) * wEnd * (d / L), sp = rnd(70, 150);
    this.fx.part('ember', m.x + ca * d - sa * off, m.y + sa * d + ca * off, ca * sp + rnd(-20, 20), sa * sp - 40, rnd(0.35, 0.65), rnd(1.4, 2.2), null, { drag: 2, grav: -40 });
  }
  if (!o.smoked && k > 0.55) { o.smoked = true; if (!o.busy && !o.rm) for (let i = 0; i < 3; i++) { const d = L * rnd(0.75, 1), off = rnd(-0.6, 0.6) * wEnd; this.fx.part('smoke', m.x + ca * d - sa * off, m.y + sa * d + ca * off, ca * 25, -26, rnd(0.7, 1), rnd(10, 14), null, { drag: 1 }); } } // 끝에 남는 연기
});
def('quake', 'ground', function (o, k) { // 배현경: 땅이 쩍 갈라지는 직선
  const cx = this.cx; this.R.world(); cx.globalAlpha = 1 - k * 0.8; const n = 8, dx = (o.x2 - o.x) / n, dy = (o.y2 - o.y) / n, nx = -dy, ny = dx, L = Math.hypot(nx, ny) || 1;
  cx.strokeStyle = '#3a2410'; cx.lineWidth = 4; cx.beginPath(); cx.moveTo(o.x, o.y + 10);
  for (let i = 1; i <= n * Math.min(1, k * 3); i++) { const j = ((i * 37) % 7 - 3) / 3; cx.lineTo(o.x + dx * i + (nx / L) * j * 6, o.y + 10 + dy * i + (ny / L) * j * 6); } cx.stroke();
  cx.globalCompositeOperation = 'lighter'; cx.strokeStyle = `rgba(255,170,90,${0.5 * (1 - k)})`; cx.lineWidth = o.w * 1.2; cx.beginPath(); cx.moveTo(o.x, o.y + 10); cx.lineTo(o.x + (o.x2 - o.x) * Math.min(1, k * 3), o.y + 10 + (o.y2 - o.y) * Math.min(1, k * 3)); cx.stroke(); cx.globalCompositeOperation = 'source-over';
});
def('spot', 'top', function (o, k) { // 강병화 핀 조명: 위에서 내려오는 빛기둥 + 바닥 동그라미
  const cx = this.cx; this.R.world(); cx.globalCompositeOperation = 'lighter'; const a = Math.sin(k * Math.PI) * 0.5;
  const gr = cx.createLinearGradient(o.x, 0, o.x, o.y); gr.addColorStop(0, 'rgba(255,240,200,0)'); gr.addColorStop(1, `rgba(255,230,170,${a})`);
  cx.fillStyle = gr; cx.beginPath(); cx.moveTo(o.x - 10, 0); cx.lineTo(o.x + 10, 0); cx.lineTo(o.x + o.r, o.y); cx.lineTo(o.x - o.r, o.y); cx.closePath(); cx.fill();
  this.R.tf(o.x, o.y + 4, 0, 1, 0.4); cx.fillStyle = `rgba(255,240,200,${a})`; cx.beginPath(); cx.arc(0, 0, o.r, 0, TAU); cx.fill(); cx.globalCompositeOperation = 'source-over';
});
def('swing', 'mid', function (o, k) { // 홍정민: 소주병 크게 휘두른 자국 (초록 반원)
  const cx = this.cx; this.R.world(); cx.globalAlpha = 1 - k; cx.strokeStyle = '#9fffb8'; cx.lineWidth = 7 * (1 - k) + 2; cx.lineCap = 'round';
  const a0 = -Math.PI / 2 - o.arc, a1 = a0 + o.arc * 2 * eOut(Math.min(1, k * 2)); cx.beginPath(); cx.arc(o.x, o.y, o.r * 0.7, a0, a1); cx.stroke();
});
def('counter', 'mid', function (o, k) { const cx = this.cx; this.R.world(); cx.globalAlpha = 1 - k; cx.strokeStyle = '#ffffff'; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(o.hx, o.hy); cx.lineTo(o.hx + (o.x - o.hx) * eOut(k), o.hy + (o.y - o.hy) * eOut(k)); cx.stroke(); });
def('hop', 'mid', function (o, k) { const cx = this.cx; this.R.world(); cx.globalAlpha = 1 - k; cx.strokeStyle = '#a07aff'; cx.lineWidth = 4; cx.beginPath(); cx.moveTo(o.x, o.y); cx.quadraticCurveTo((o.x + o.x2) / 2, Math.min(o.y, o.y2) - 30, o.x2, o.y2); cx.stroke(); });
def('pix', 'top', function (o, k) { const cx = this.cx, cols = ['#f3c8a8', '#ff4fb0', '#2a1020', '#d89a7a']; for (let i = 0; i < o.n; i++) { const a = (i / o.n) * TAU + i, d = (o.r || 18) * eOut(k) * (0.4 + (i % 3) * 0.3); this.R.tf(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, 0, 1, 1); cx.globalAlpha = 1 - k; cx.fillStyle = cols[i % 4]; cx.fillRect(-3, -3, 6, 6); } });
def('bloom', 'top', function (o, k) { const cx = this.cx; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + k * 2, d = o.r * eOut(k); this.R.tf(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d * 0.6, a, 1, 1); cx.globalAlpha = 1 - k; cx.fillStyle = i % 2 ? '#ff3d6e' : '#ff9ab5'; cx.beginPath(); cx.ellipse(0, 0, 7, 4, 0, 0, TAU); cx.fill(); } });
def('line', 'top', function (o, k) { const cx = this.cx; this.R.world(); cx.globalAlpha = 1 - k; cx.strokeStyle = o.col; cx.lineWidth = 2; if (o.dash) cx.setLineDash([3, 3]); cx.beginPath(); cx.moveTo(o.x, o.y); cx.lineTo(o.x2, o.y2); cx.stroke(); cx.setLineDash([]); });
def('redcard', 'top', function (o, k) { // 운영진: 거대한 레드카드가 빙글 돌며 꽂힌다 → 빨간 충격 고리
  const cx = this.cx, fall = Math.min(1, k / 0.45), x = o.hx + (o.x - o.hx) * eOut(fall), y = o.hy + (o.y - o.hy) * fall - Math.sin(fall * Math.PI) * 80;
  this.R.tf(x, y, (1 - fall) * 9, 1.6 - 0.4 * fall, 1.6 - 0.4 * fall); cx.globalAlpha = k < 0.85 ? 1 : (1 - k) / 0.15;
  const im = this.R.images.w_card_r;
  if (imgOk(im)) cx.drawImage(im, -26, -26, 52, 52); else { cx.fillStyle = '#e8102a'; cx.strokeStyle = '#fff'; cx.lineWidth = 2; cx.fillRect(-11, -15, 22, 30); cx.strokeRect(-11, -15, 22, 30); } // 광택 레드카드 그림 (없으면 코드 네모)
  if (k > 0.45) { this.R.tf(o.x, o.y + 6, 0, 1, 0.45); const q = (k - 0.45) / 0.55; cx.globalAlpha = 1 - q; cx.strokeStyle = '#ff2a3a'; cx.lineWidth = 6; cx.beginPath(); cx.arc(0, 0, o.r * eOut(q), 0, TAU); cx.stroke(); }
});
def('sendoff', 'top', function (o, k) { const cx = this.cx; this.R.world(); cx.globalAlpha = 1 - k; cx.strokeStyle = '#ff3b4f'; cx.lineWidth = 8; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(o.x, o.y0); cx.lineTo(o.x, o.y0 + (o.y1 - o.y0) * eOut(Math.min(1, k * 2))); cx.stroke(); });
def('squint', 'top', function (o, k) { // 서명훈 실눈: 머리 위에 실눈 두 줄 번쩍 + 표적마다 조준 표시
  const h = o.h, cx = this.cx; if (h) { this.R.tf(h.x, h.y - 96, 0, 1, 1); cx.globalAlpha = Math.sin(k * Math.PI); cx.strokeStyle = '#e0c3ff'; cx.lineWidth = 3; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(-16, 0); cx.lineTo(-5, -2); cx.moveTo(5, -2); cx.lineTo(16, 0); cx.stroke(); }
  for (const t of o.list || []) { // 조준: 네 귀퉁이 꺾쇠가 빙글 돌며 조여 들고 · 가운데 붉은 점
    const q = eOut(c01(k / 0.5)), r = 30 - 14 * q, a = k < 0.75 ? 1 : (1 - k) / 0.25;
    this.R.tf(t.x, t.y - 10, (1 - q) * 1.6, 1, 1); cx.globalAlpha = a; cx.lineCap = 'round';
    for (const [w, col] of [[4.5, 'rgba(40,0,40,0.75)'], [2.2, '#ff6ae0']]) { cx.strokeStyle = col; cx.lineWidth = w; cx.beginPath(); for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2 + Math.PI / 4, sx = Math.sign(Math.cos(an)), sy = Math.sign(Math.sin(an)), px = sx * r * 0.72, py = sy * r * 0.72; cx.moveTo(px - sx * 8, py); cx.lineTo(px, py); cx.lineTo(px, py - sy * 8); } cx.stroke(); }
    cx.fillStyle = '#ff3a8a'; cx.beginPath(); cx.arc(0, 0, 2.6 + 1.2 * Math.sin(k * 30), 0, TAU); cx.fill();
  }
});
// 실눈 저격 벼락: 하늘에서 굵게 내리꽂는 지그재그 (넓은 보라 빛 → 자홍 몸통 → 흰 심 · 곁가지 2개 · 1/30초마다 모양이 바뀜) + 땅 충격 빛 · 고리 + 만화 욕 딱지
def('skybolt', 'top', function (o, k, g, now) {
  const cx = this.cx, R = this.R, fz = o.frozen, gl = fz ? gIce() : gCurse();
  const strike = c01(k / 0.12), a = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
  let s = Math.floor(o.seed * 1000 + Math.floor(now * 30) * 7.31) % 233280; const rn = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const n = 9, y0 = -20, yEnd = y0 + (o.y - y0) * strike, pts = [o.x + (rn() - 0.5) * 30, y0];
  for (let i = 1; i < n; i++) { const yy = y0 + ((o.y - y0) / n) * i; if (yy > yEnd) break; pts.push(o.x + (rn() - 0.5) * 34 * (1 - i / n * 0.6), yy); }
  pts.push(o.x, yEnd);
  const path = (p) => { cx.beginPath(); cx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) cx.lineTo(p[i], p[i + 1]); };
  R.world(); cx.lineJoin = 'round'; cx.lineCap = 'round';
  const W = 1 + (k < 0.15 ? 0.6 : 0) * (1 - k / 0.15);
  cx.globalAlpha = a * 0.75; cx.strokeStyle = 'rgba(30,0,40,0.85)'; cx.lineWidth = 11 * W; path(pts); cx.stroke(); // 어두운 테 (밝은 바닥에서도)
  cx.globalCompositeOperation = 'lighter';
  if (!o.rm) { cx.globalAlpha = a * 0.35; cx.strokeStyle = fz ? 'rgb(90,200,255)' : 'rgb(190,60,255)'; cx.lineWidth = 24 * W; path(pts); cx.stroke(); }
  cx.globalAlpha = a; cx.strokeStyle = fz ? 'rgb(120,220,255)' : 'rgb(230,70,220)'; cx.lineWidth = 7 * W; path(pts); cx.stroke();
  cx.strokeStyle = '#ffffff'; cx.lineWidth = 2.6 * W; path(pts); cx.stroke();
  if (pts.length > 8) for (let b = 0; b < 2; b++) { // 곁가지
    const i = 2 * (1 + Math.floor(rn() * (pts.length / 2 - 2))), bx = pts[i], by = pts[i + 1], sd = b ? 1 : -1, bp = [bx, by, bx + sd * (10 + rn() * 12), by + 12 + rn() * 10, bx + sd * (18 + rn() * 16), by + 28 + rn() * 14];
    cx.globalAlpha = a * 0.8; cx.strokeStyle = fz ? 'rgb(150,230,255)' : 'rgb(220,110,255)'; cx.lineWidth = 3; path(bp); cx.stroke(); cx.strokeStyle = '#fff'; cx.lineWidth = 1; path(bp); cx.stroke();
  }
  if (strike >= 1 && gl) { // 땅 충격: 빛 덩어리 · 납작한 빛 · 퍼지는 고리
    const q = c01((k - 0.12) / 0.5), r = 34 + 26 * eOut(q);
    R.tf(o.x, o.y, 0, 1, 1); cx.globalAlpha = a * 0.9; cx.drawImage(gl, -r, -r, r * 2, r * 2);
    R.tf(o.x, o.y + 10, 0, 1, 0.35); cx.globalAlpha = a * 0.7; cx.drawImage(gl, -r * 1.6, -r * 1.6, r * 3.2, r * 3.2);
    cx.globalAlpha = (1 - q) * 0.9; cx.strokeStyle = fz ? '#cff6ff' : '#ff9af0'; cx.lineWidth = 4 * (1 - q) + 1; cx.beginPath(); cx.arc(0, 0, 12 + 46 * eOut(q), 0, TAU); cx.stroke();
  }
  cx.globalCompositeOperation = 'source-over';
  if (k > 0.1) { // 만화 욕 딱지: 톡 커졌다가 위로
    const q = c01((k - 0.1) / 0.2), sc = Math.max(0.05, eBack(q)), ty = o.y - 34 - eOut(c01((k - 0.1) / 0.9)) * 14;
    R.tf(o.x + 14, ty, -0.12, sc, sc); cx.globalAlpha = c01(a * 1.4);
    cx.fillStyle = 'rgb(28,0,30)'; cx.strokeStyle = fz ? '#bff6ff' : '#ff6ae0'; cx.lineWidth = 2; cx.beginPath(); for (let i = 0; i < 14; i++) { const an = i * TAU / 14, rr = i % 2 ? 11 : 16; cx.lineTo(Math.cos(an) * rr * 1.45, Math.sin(an) * rr); } cx.closePath(); cx.fill(); cx.stroke();
    cx.font = `900 12px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = fz ? '#dff8ff' : '#ffe14d'; cx.fillText('#@!%', 0, 0.5);
  }
});
def('freezein', 'top', function (o, k) { // 꽁꽁: 하얀 서리 섬광 + 퍼지는 서리 고리 (블록 자체는 drawIce)
  const cx = this.cx, R = this.R, gl = gIce(); if (!gl) return;
  cx.globalCompositeOperation = 'lighter';
  R.tf(o.x, o.y, 0, 1, 1); cx.globalAlpha = (1 - k) * 0.95; const r = 22 + 30 * eOut(k); cx.drawImage(gl, -r, -r, r * 2, r * 2);
  R.tf(o.x, o.y + o.r + 14, 0, 1, 0.35); cx.globalAlpha = (1 - k) * 0.9; cx.strokeStyle = '#dff8ff'; cx.lineWidth = 5 * (1 - k) + 1; cx.beginPath(); cx.arc(0, 0, 10 + 50 * eOut(k), 0, TAU); cx.stroke();
  cx.globalCompositeOperation = 'source-over';
});
def('iceburst', 'top', function (o, k) { // 얼음 깨짐: 그린 폭발 그림이 확 커지며 사라짐 (처음엔 더하기 한 겹 더)
  const cx = this.cx, R = this.R, im = R.images.vfx_ice_burst; if (!imgOk(im)) return;
  const sc = 0.45 + 0.75 * eOut(k), S = o.s * sc, a = k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5;
  R.tf(o.x, o.y, o.rot || 0, 1, 1); cx.globalAlpha = a; cx.drawImage(im, -S / 2, -S / 2, S, S);
  if (k < 0.3) { cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = (1 - k / 0.3) * 0.8; cx.drawImage(im, -S * 0.35, -S * 0.35, S * 0.7, S * 0.7); cx.globalCompositeOperation = 'source-over'; }
});
def('mirror', 'top', function (o, k, g, now) { // 김도훈 앵콜: 내려오는 미러볼 + 무지개 조명 빔이 무대를 훑는다
  const cx = this.cx, drop = eOut(Math.min(1, k * 6)), by = 20 + (o.y - o.r - 60) * drop;
  this.R.world(); cx.globalCompositeOperation = 'lighter';
  const cols = ['#ff4fd8', '#6ff0ff', '#ffd23f', '#9b6bff'];
  for (let i = 0; i < 4; i++) { const a = now * 2 + i * 1.57, tx = o.x + Math.cos(a) * o.r, ty = o.y + Math.sin(a) * o.r * 0.45; cx.globalAlpha = 0.28 * (1 - Math.max(0, k - 0.85) / 0.15); cx.fillStyle = cols[i]; cx.beginPath(); cx.moveTo(o.x - 4, by); cx.lineTo(o.x + 4, by); cx.lineTo(tx + 16, ty); cx.lineTo(tx - 16, ty); cx.closePath(); cx.fill(); }
  cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1 - Math.max(0, k - 0.85) / 0.15;
  cx.strokeStyle = '#ddd'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(o.x, 0); cx.lineTo(o.x, by - 12); cx.stroke();
  const gr = cx.createRadialGradient(o.x - 4, by - 4, 2, o.x, by, 13); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#8a8aa8'); cx.fillStyle = gr; cx.beginPath(); cx.arc(o.x, by, 13, 0, TAU); cx.fill();
  cx.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 6; i++) { const a = now * 3 + i; cx.fillRect(o.x + Math.cos(a) * 8 - 1.5, by + Math.sin(a) * 8 - 1.5, 3, 3); }
  this.R.tf(o.x, o.y + 6, 0, 1, 0.42); cx.globalAlpha = 0.5 * (1 - Math.max(0, k - 0.85) / 0.15); cx.strokeStyle = '#ffd23f'; cx.lineWidth = 3; cx.setLineDash([10, 8]); cx.lineDashOffset = -now * 40; cx.beginPath(); cx.arc(0, 0, o.r, 0, TAU); cx.stroke(); cx.setLineDash([]);
});
def('vroom', 'mid', function (o, k) { const cx = this.cx; this.R.world(); cx.globalAlpha = 1 - k; cx.strokeStyle = '#3f8cff'; cx.lineWidth = 10; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(o.x, o.y - 20); cx.lineTo(o.x + (o.tx - o.x) * eOut(k), o.y - 20 + (o.ty - o.y + 20) * eOut(k)); cx.stroke(); });
def('tapefly', 'top', function (o, k) { const cx = this.cx, x = o.hx + (o.x - o.hx) * k, y = o.hy + (o.y - o.hy) * k - Math.sin(k * Math.PI) * 60; this.R.tf(x, y, k * 12, 1, 1); cx.globalAlpha = 1; cx.fillStyle = '#f7f3ea'; cx.beginPath(); cx.arc(0, 0, 9, 0, TAU); cx.fill(); cx.strokeStyle = '#c9c1ae'; cx.lineWidth = 2; cx.stroke(); });
// 박나영 급강하 (top): 진짜 박나뇽 그림이 잔상을 끌며 화면 위로 솟구침 → (예고 동안 하늘) → 불꼬리 · 속도선과 함께 내리꽂힘. 진행은 sim 장판 z 에 맞춘다
const DIVE_UP = 0.3, DIVE_DOWN = 0.64;
def('dive', 'top', function (o, k, g, now) {
  const z = o.z; if (!z || !g.zones || !g.zones.includes(z) || z.t <= 0) return;
  const cx = this.cx, R = this.R, sp = R.sprites.h_dragon, box = 82, p = c01(1 - z.t / z.max), im = R.images.dr_breath, gf = R.projSprites.glowFire;
  if (!sp) return;
  const body = (x, y, s, sy, rot, a) => { R.tf(x, y, rot, s, s * sy); cx.globalAlpha = a; cx.drawImage(sp.c, -box / 2, -box * 0.92, box, box); };
  if (p < DIVE_UP) { // 솟구치기
    const q = p / DIVE_UP, top = o.y + 170, st = Math.sin(q * Math.PI);
    const pos = (qq) => ({ x: o.x + (o.tx - o.x) * 0.12 * qq * qq, y: o.y - qq * qq * top });
    const P0 = pos(q);
    if (gf) { R.tf(P0.x, P0.y + 4, 0, 1, 1); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.8 * (1 - q * 0.5); cx.drawImage(gf.c, -18, -10, 36, 50 + 60 * q); cx.globalCompositeOperation = 'source-over'; } // 아래로 내뿜는 불빛 (추진)
    if (!o.rm) for (let j = 3; j >= 1; j--) { const P1 = pos(Math.max(0, q - j * 0.08)); body(P1.x, P1.y, 1 + 0.3 * q, 1 + 0.15 * st, -0.15 * q, 0.16 / j); } // 잔상
    body(P0.x, P0.y, 1 + 0.3 * q, 1 + 0.18 * st, -0.15 * q, 1);
    if (!o.rm && q > 0.15) { R.world(); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 1; cx.strokeStyle = 'rgba(255,240,210,0.55)'; cx.lineWidth = 2; cx.beginPath(); for (let i = -2; i <= 2; i++) { const x = P0.x + i * 13, y = P0.y + 12 + Math.abs(i) * 6; cx.moveTo(x, y); cx.lineTo(x, y + 40 + 50 * q); } cx.stroke(); cx.globalCompositeOperation = 'source-over'; } // 속도선
  } else if (p >= DIVE_DOWN) { // 내리꽂기
    const q = (p - DIVE_DOWN) / (1 - DIVE_DOWN), y0 = -30, y = y0 + (o.ty + 4 - y0) * Math.pow(q, 1.6), s = 1.45 - 0.3 * q;
    if (imgOk(im)) { // 위로 길게 남는 불꼬리
      const fw = im.naturalWidth / 8, fi = Math.floor(now * 24) % 8, len = 70 + 190 * q, H = 74 * s;
      R.tf(o.tx, y - box * 0.45 * s, -Math.PI / 2, 1, 1);
      cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 0.95; cx.drawImage(im, fi * fw, 0, fw, im.naturalHeight, 0, -H / 2, len, H);
      cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.6; cx.drawImage(im, ((fi + 4) % 8) * fw, 0, fw, im.naturalHeight, 0, -H * 0.3, len * 0.8, H * 0.6);
      cx.globalCompositeOperation = 'source-over';
    }
    if (!o.rm) { R.world(); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 1; cx.strokeStyle = 'rgba(255,245,220,0.6)'; cx.lineWidth = 2; cx.beginPath(); for (let i = -3; i <= 3; i++) { if (!i) continue; const x = o.tx + i * 15 * s, yy = y - box * s * (0.9 + (Math.abs(i) % 2) * 0.3); cx.moveTo(x, yy); cx.lineTo(x, yy - 60 - 80 * q); } cx.stroke(); cx.globalCompositeOperation = 'source-over'; } // 속도선
    if (gf) { R.tf(o.tx, y - box * 0.4 * s, 0, 1, 1); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.25 + 0.3 * q; cx.drawImage(gf.c, -55 * s, -55 * s, 110 * s, 110 * s); cx.globalCompositeOperation = 'source-over'; } // 몸 뒤 불빛
    body(o.tx, y, s * 0.9, 1.22, 0, 1);
  }
  cx.globalAlpha = 1;
});
def('divehome', 'top', function (o, k) { // 쾅 뒤 박나뇽이 폴짝 자리로 돌아간다
  const h = o.h; if (!h) return; const sp = this.R.sprites.h_dragon; if (!sp) return;
  const cx = this.cx, box = 82, tx = h.x, ty = h.y + box * 0.3, e = eOut(k), x = o.x + (tx - o.x) * e, y = o.y + (ty - o.y) * e - Math.sin(k * Math.PI) * 70, s = 1.1 - 0.1 * k;
  this.R.tf(x, y, Math.sin(k * Math.PI) * -0.2, s, s); cx.globalAlpha = 1; cx.drawImage(sp.c, -box / 2, -box * 0.92, box, box);
});
def('boomg', 'ground', function (o, k) { // 쾅 바닥: 충격파 고리 (하양 → 주황) · 달아오른 자리 · 흙먼지 고리
  const cx = this.cx, r = o.r; this.R.tf(o.x, o.y + 6, 0, 1, 0.45);
  cx.globalCompositeOperation = 'lighter';
  const q = eOut(c01(k / 0.55));
  if (k < 0.55) { cx.globalAlpha = 1 - k / 0.55; cx.strokeStyle = '#fff3d0'; cx.lineWidth = 12 * (1 - q) + 2; cx.beginPath(); cx.arc(0, 0, r * (0.2 + 1.3 * q), 0, TAU); cx.stroke(); cx.strokeStyle = '#ff8a2a'; cx.lineWidth = 5; cx.beginPath(); cx.arc(0, 0, r * (0.15 + 1.2 * q), 0, TAU); cx.stroke(); }
  const gl = cx.createRadialGradient(0, 0, 0, 0, 0, r); gl.addColorStop(0, `rgba(255,220,140,${0.8 * (1 - k)})`); gl.addColorStop(0.6, `rgba(255,110,30,${0.45 * (1 - k)})`); gl.addColorStop(1, 'rgba(255,60,0,0)');
  cx.globalAlpha = 1; cx.fillStyle = gl; cx.beginPath(); cx.arc(0, 0, r, 0, TAU); cx.fill();
  cx.globalCompositeOperation = 'source-over';
  if (!o.rm) { const q2 = eOut(k); cx.globalAlpha = 0.45 * (1 - k); cx.strokeStyle = 'rgba(150,120,95,0.9)'; cx.lineWidth = 16 * (1 - k) + 4; cx.beginPath(); cx.arc(0, 0, r * (0.5 + 0.9 * q2), 0, TAU); cx.stroke(); }
});
def('boom', 'top', function (o, k) { // 쾅 불덩이 (띠 6칸) + 바깥으로 튀는 불꽃 혀
  const cx = this.cx, R = this.R, r = o.r, bi = R.images.dr_burst, fl = R.images.dr_flame;
  if (imgOk(fl) && !o.rm && k < 0.45) { // 사방으로 뻗는 불꽃 혀 (길이 · 각도 제각각)
    const fw = fl.naturalWidth / 8, q = k / 0.45, n = 9;
    for (let i = 0; i < n; i++) {
      const j = (i * 37 + 11) % 7 / 6, a = o.seed + (i / n) * TAU + (j - 0.5) * 0.5, d = r * (0.3 + (0.6 + 0.4 * j) * eOut(q)), hgt = r * (0.3 + 0.28 * j) * (1 - q * 0.6);
      R.tf(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d * 0.45 - 6, a + Math.PI / 2, 1, 1); cx.globalAlpha = 1 - q;
      cx.drawImage(fl, ((i + Math.floor(k * 20)) % 8) * fw, 0, fw, fl.naturalHeight, -hgt * 0.33, -hgt, hgt * 0.67, hgt);
    }
  }
  if (imgOk(bi)) {
    const fw = bi.naturalWidth / 6, fi = Math.min(5, Math.floor(k * 6)), D = r * 2.3 * (0.75 + 0.25 * eOut(k));
    R.tf(o.x, o.y - r * 0.28 - k * 12, 0, 1, 0.88); cx.globalAlpha = 1; cx.drawImage(bi, fi * fw, 0, fw, bi.naturalHeight, -D / 2, -D / 2, D, D);
    if (k < 0.5) { cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.6 * (1 - k / 0.5); cx.drawImage(bi, fi * fw, 0, fw, bi.naturalHeight, -D * 0.4, -D * 0.4, D * 0.8, D * 0.8); cx.globalCompositeOperation = 'source-over'; }
  } else if (!o.blasted) { o.blasted = true; this.fx.blast(o.x, o.y, r * 1.3, 'fire'); }
  cx.globalAlpha = 1;
});
def('ramp', 'mid', function (o, k) { const cx = this.cx; this.R.tf(o.x, o.y + 16, 0, 1, 1); cx.globalAlpha = Math.min(1, (1 - k) * 3); cx.fillStyle = '#ff7ac8'; cx.beginPath(); cx.moveTo(-22, 6); cx.lineTo(22, 6); cx.lineTo(22, -10); cx.closePath(); cx.fill(); this.R.tf(o.tx, o.ty + 6, 0, 1, 0.45); cx.globalAlpha = 0.5 * k; cx.fillStyle = 'rgba(0,30,60,0.6)'; cx.beginPath(); cx.arc(0, 0, o.r * k, 0, TAU); cx.fill(); });
def('wink', 'top', function (o, k) { // 이한나 윙크 폭탄: 거대한 눈이 찡긋 → 분홍 하트 충격파 세 겹 (건전녀 하트 방패와 다르게: 눈 · 겹 고리 · 진분홍)
  const cx = this.cx, close = Math.sin(Math.min(1, k * 2.5) * Math.PI);
  this.R.tf(o.x, o.y - 30, 0, 1, 1); cx.globalAlpha = Math.max(0, 1 - k * 1.4);
  cx.fillStyle = '#fff'; cx.beginPath(); cx.ellipse(0, 0, 34, 18 * (1 - close * 0.92), 0, 0, TAU); cx.fill();
  cx.fillStyle = '#c0307a'; cx.beginPath(); cx.arc(0, 0, 10 * (1 - close * 0.9), 0, TAU); cx.fill();
  cx.strokeStyle = '#2a0a1a'; cx.lineWidth = 3; cx.beginPath(); cx.ellipse(0, 0, 34, 18 * (1 - close * 0.92), 0, Math.PI, TAU); cx.stroke();
  for (let i = 0; i < 5; i++) { const a = Math.PI + 0.3 + i * 0.6; cx.beginPath(); cx.moveTo(Math.cos(a) * 34, Math.sin(a) * 18 * (1 - close * 0.92)); cx.lineTo(Math.cos(a) * 44, Math.sin(a) * 28); cx.stroke(); } // 속눈썹
  this.R.tf(o.x, o.y + 6, 0, 1, 0.45); cx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) { const q = c01(k * 1.4 - i * 0.18); if (q <= 0 || q >= 1) continue; cx.globalAlpha = 1 - q; cx.strokeStyle = i % 2 ? '#ff6fd8' : '#ff2a8a'; cx.lineWidth = 6; cx.beginPath(); cx.arc(0, 0, o.r * q, 0, TAU); cx.stroke(); }
  cx.globalCompositeOperation = 'source-over';
});
def('aid', 'mid', function (o, k) { // 건전녀 응급 방패: 멤버마다 초록 십자 + 하얀 돔 (위로 쑥)
  const h = o.h; if (!h) return; const cx = this.cx, q = eOut(Math.min(1, k * 2));
  this.R.tf(h.x, h.y - 20, 0, 1, 1); cx.globalAlpha = (1 - k) * 0.9; cx.strokeStyle = '#e8fff0'; cx.lineWidth = 3; cx.beginPath(); cx.arc(0, 0, 34 * q, Math.PI, TAU); cx.stroke();
  cx.fillStyle = '#4fd18b'; cx.fillRect(-3, -60 - 20 * k, 6, 16); cx.fillRect(-8, -55 - 20 * k, 16, 6);
});
// 8-10 신랑 친구 대표 기술 연출
def('toast', 'top', function (o, k) { // 머리 위 샴페인 잔 번쩍 + 금빛 거품
  const cx = this.cx, s = 1 + 0.3 * Math.sin(Math.min(1, k * 3) * Math.PI); this.R.tf(o.x, o.y, Math.sin(k * 20) * 0.15, s, s); cx.globalAlpha = 1 - Math.max(0, k - 0.7) / 0.3;
  cx.fillStyle = 'rgba(255,240,170,0.85)'; cx.beginPath(); cx.moveTo(-10, -18); cx.lineTo(10, -18); cx.lineTo(4, 2); cx.lineTo(-4, 2); cx.closePath(); cx.fill(); cx.strokeStyle = '#fff'; cx.lineWidth = 1.5; cx.stroke();
  cx.fillStyle = '#e8d8a0'; cx.fillRect(-1, 2, 2, 12); cx.fillRect(-7, 13, 14, 2);
  cx.globalCompositeOperation = 'lighter'; const gr = cx.createRadialGradient(0, -8, 2, 0, -8, 30); gr.addColorStop(0, `rgba(255,240,180,${0.8 * (1 - k)})`); gr.addColorStop(1, 'rgba(255,220,120,0)'); cx.fillStyle = gr; cx.fillRect(-30, -38, 60, 60); cx.globalCompositeOperation = 'source-over';
  if (Math.random() < 0.6) this.fx.part('dot', o.x + (Math.random() - 0.5) * 16, o.y - 16, (Math.random() - 0.5) * 20, -60 - Math.random() * 40, 0.7, 3 + Math.random() * 2, '#ffe9a0');
});
def('champ', 'top', function (o, k) { // 샴페인 줄기가 멤버에게 쏟아져 둥글게 팡
  const cx = this.cx;
  if (k < 0.45) { const q = k / 0.45, x = o.x + (o.tx - o.x) * q, y = o.y + (o.ty - o.y) * q - Math.sin(q * Math.PI) * 50; this.R.tf(x, y, 0, 1, 1); cx.globalAlpha = 1; cx.fillStyle = '#ffe9a0'; cx.beginPath(); cx.arc(0, 0, 6, 0, Math.PI * 2); cx.fill(); if (Math.random() < 0.7) this.fx.part('dot', x, y, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 0.4, 3, '#fff6c8'); return; }
  const q = (k - 0.45) / 0.55; this.R.tf(o.tx, o.ty, 0, 1, 1); cx.globalAlpha = 1 - q;
  cx.strokeStyle = '#ffe9a0'; cx.lineWidth = 5; cx.beginPath(); cx.arc(0, 0, 10 + 40 * q, 0, Math.PI * 2); cx.stroke();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; cx.fillStyle = i % 2 ? '#fff6c8' : '#ffd86a'; cx.beginPath(); cx.arc(Math.cos(a) * (14 + 34 * q), Math.sin(a) * (14 + 34 * q), 3.5 * (1 - q) + 1, 0, Math.PI * 2); cx.fill(); }
});
def('speechRing', 'top', function (o, k) { const q = k - (o.delay || 0) / o.dur; if (q <= 0) return; const cx = this.cx; this.R.tf(o.x, o.y, 0, 1, 0.6); cx.globalAlpha = 1 - q; cx.strokeStyle = '#d8d8e8'; cx.lineWidth = 4; cx.setLineDash([10, 6]); cx.beginPath(); cx.arc(0, 0, 30 + q * 260, 0, Math.PI * 2); cx.stroke(); cx.setLineDash([]); });
def('scroll', 'mid', function (o, k) { // 회색 두루마리가 멤버를 칭칭 (축사에 지쳐 공속 ↓)
  const h = o.h; if (!h || h.gone) return; const cx = this.cx, wrap = Math.min(1, k * 6), a = k > 0.9 ? (1 - k) / 0.1 : 1;
  this.R.tf(h.x, h.y - 26, 0, 1, 1); cx.globalAlpha = 0.85 * a;
  for (let i = 0; i < 3; i++) { const y = -20 + i * 16; cx.fillStyle = i % 2 ? '#d6d2c6' : '#ece8dc'; cx.fillRect(-22 * wrap, y, 44 * wrap, 9); cx.strokeStyle = '#9a968a'; cx.lineWidth = 1; cx.strokeRect(-22 * wrap, y, 44 * wrap, 9); cx.fillStyle = '#8a867a'; for (let j = -16; j < 16 * wrap; j += 7) cx.fillRect(j, y + 4, 4, 1); }
  if (Math.random() < 0.03) this.fx.text(h.x + 10, h.y - 80, 'Zzz…', '#d8d8e8', 11, 0.9);
});
def('carpet', 'ground', function (o, k) { // 두루마리가 레드카펫처럼 쫙 (입구 쪽으로)
  const cx = this.cx, un = Math.min(1, k * 4), y1 = o.y0 + (o.y1 - o.y0) * un, a = k > 0.8 ? (1 - k) / 0.2 : 1;
  this.R.world(); cx.globalAlpha = 0.9 * a;
  cx.fillStyle = '#b0182a'; cx.fillRect(o.x - 22, o.y0, 44, y1 - o.y0); cx.fillStyle = '#e8c860'; cx.fillRect(o.x - 22, o.y0, 3, y1 - o.y0); cx.fillRect(o.x + 19, o.y0, 3, y1 - o.y0);
  cx.fillStyle = '#ece8dc'; cx.beginPath(); cx.ellipse(o.x, y1, 25, 7, 0, 0, Math.PI * 2); cx.fill(); cx.strokeStyle = '#9a968a'; cx.lineWidth = 1.5; cx.stroke(); // 굴러가는 두루마리 끝
});
def('flag', 'mid', function (o, k) { const h = o.h; if (!h) return; const cx = this.cx, q = eOut(Math.min(1, k * 3)); this.R.tf(h.x + 18, h.y - 10 - 40 * q, Math.sin(k * 20) * 0.05, 1, 1); cx.globalAlpha = 1 - Math.max(0, k - 0.7) / 0.3; cx.fillStyle = '#8a6a3a'; cx.fillRect(-1.5, 0, 3, 46); cx.fillStyle = '#ffd23f'; cx.beginPath(); cx.moveTo(1, 0); cx.lineTo(26, 7 + Math.sin(k * 30) * 2); cx.lineTo(1, 16); cx.closePath(); cx.fill(); });
