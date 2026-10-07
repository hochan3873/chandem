// 랑방 대전 — 시즌 테마 전투 장식 (season.js 의 battle 설정 · render.js 훅 R.ssnBake / R.ssnDraw)
//  배경에 한 번 굽는 것: 보라 · 주황 빛, 테두리 어둡게, 달, 위 모서리 거미줄, 양옆 인도 호박등
//  매 프레임 (가볍게): 바리케이드 양 끝 호박 · 촛불 깜빡임, 가끔 위로 지나가는 박쥐, 가장자리 유령
//  움직임 줄이기(body.rm): 깜빡임 · 날아다니는 것 없이 멈춘 그림만
//  시즌이 끝나면 season.js 에서 battle 만 빼면 된다 (그림도 그때만 받는다)
const TAU = Math.PI * 2;
const rmOn = () => typeof document !== 'undefined' && document.body && document.body.classList.contains('rm');
const IMG = {};
function img(src) {
  if (!IMG[src]) { const im = new Image(); im.decoding = 'async'; im.src = src; IMG[src] = im; }
  return IMG[src];
}
const ok = (im) => im && im.complete && im.naturalWidth > 0;
// 전투 장식 설정 (season.js SEASONS[].battle 이 이 키를 고른다)
export const BATTLE = {
  halloween: {
    art: { web: '/img/lb/season/deco_web.webp', pumpkin: '/img/lb/season/deco_pumpkins.webp', candle: '/img/lb/season/deco_candles.webp', ghost: '/img/lb/season/deco_ghost.webp', bat: '/img/lb/season/hw_bat.webp' },
    top: 'rgba(120,50,200,0.30)', // 위쪽 보랏빛
    low: 'rgba(255,120,30,0.16)', // 아래 호박 불빛
    edge: 'rgba(40,6,60,0.42)', // 가장자리
    moon: true,
  },
};
const S = { bats: [], ghosts: [], last: 0, seed: 7, batT: 3 };
const rnd = () => { S.seed = (S.seed * 16807) % 2147483647; return S.seed / 2147483647; };

// 그림을 미리 받아 두고, 다 오면 배경을 다시 굽는다
export function prepSeason(R, key) {
  const cfg = key && BATTLE[key];
  if (!cfg) return null;
  const ims = Object.values(cfg.art).map(img);
  for (const im of ims) if (!ok(im)) im.addEventListener('load', () => { if (R.ssn === cfg) R.bakeBg(); }, { once: true });
  S.bats.length = 0; S.ghosts.length = 0; S.batT = 2 + rnd() * 3;
  return cfg;
}

function glowDot(x, cx, cy, r, col) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
  x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
}
function drawFit(x, im, cx, by, w, flip) { // 가운데 아래 기준 (by = 바닥)
  if (!ok(im)) return;
  const h = w * (im.naturalHeight / im.naturalWidth);
  if (flip) { x.save(); x.translate(cx, 0); x.scale(-1, 1); x.drawImage(im, -w / 2, by - h, w, h); x.restore(); } else x.drawImage(im, cx - w / 2, by - h, w, h);
}

// 배경 굽기 (bakeBg 끝에서 · 한 번만)
export function bakeSeason(R, x, W, H, rowY) {
  const c = R.ssn; if (!c) return;
  const a = c.art;
  // 빛: 위 보라 · 아래 주황 · 가장자리
  let g = x.createLinearGradient(0, 0, 0, H * 0.6);
  g.addColorStop(0, c.top); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H * 0.6);
  g = x.createRadialGradient(W / 2, rowY, 20, W / 2, rowY, W * 0.9);
  g.addColorStop(0, c.low); g.addColorStop(1, 'rgba(255,120,30,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, c.edge); g.addColorStop(0.16, 'rgba(0,0,0,0)'); g.addColorStop(0.84, 'rgba(0,0,0,0)'); g.addColorStop(1, c.edge);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // 보름달 (오른쪽 위 · HUD 아래)
  if (c.moon) {
    const mx = W * 0.64, my = 122; // (오른쪽 위 거미줄과 안 겹치게)
    glowDot(x, mx, my, 70, 'rgba(255,200,120,0.28)');
    x.fillStyle = 'rgba(255,236,190,0.9)'; x.beginPath(); x.arc(mx, my, 20, 0, TAU); x.fill();
    x.fillStyle = 'rgba(230,190,130,0.45)'; for (const [dx, dy, r] of [[-6, -4, 5], [5, 6, 4], [7, -7, 2.5]]) { x.beginPath(); x.arc(mx + dx, my + dy, r, 0, TAU); x.fill(); }
  }
  // 위 모서리 거미줄
  const web = img(a.web);
  if (ok(web)) {
    const s = 96, h = s * (web.naturalHeight / web.naturalWidth);
    x.globalAlpha = 0.75; x.drawImage(web, 0, 52, s, h);
    x.save(); x.translate(W, 0); x.scale(-1, 1); x.drawImage(web, 0, 52, s, h); x.restore();
    x.globalAlpha = 1;
  }
  // 양옆 인도 호박등 (길 한가운데는 비워 둔다)
  const pk = img(a.pumpkin);
  if (ok(pk)) {
    for (const [px, fy, w, fl] of [[22, 0.36, 40, false], [W - 22, 0.5, 36, true], [20, 0.62, 34, false], [W - 20, 0.24, 30, true]]) {
      const by = Math.min(rowY - 60, H * fy);
      glowDot(x, px, by - w * 0.35, w * 1.1, 'rgba(255,140,40,0.35)');
      drawFit(x, pk, px, by, w, fl);
    }
  }
}

// 매 프레임: 'back' = 배경 바로 위 (유령 · 박쥐) · 'gate' = 바리케이드 위 (호박 · 촛불)
export function drawSeason(R, g, t, layer) {
  const c = R.ssn; if (!c) return;
  const cx = R.cx, W = R.W, rm = rmOn(), a = c.art;
  if (layer === 'back') {
    const dt = Math.min(0.05, Math.max(0, t - (S.last || t))); S.last = t;
    const top = 70, bot = Math.max(top + 80, (g ? g.ropeY : R.H * 0.7) - 120);
    // 유령 2마리: 가장자리를 천천히 오르내림 (반투명)
    const gh = img(a.ghost);
    if (ok(gh)) {
      if (!S.ghosts.length) for (let i = 0; i < 2; i++) S.ghosts.push({ side: i, p: rnd() * TAU, y: top + 40 + rnd() * (bot - top - 40) });
      for (const q of S.ghosts) {
        const x0 = q.side ? W - 26 : 26;
        const bob = rm ? 0 : Math.sin(t * 1.2 + q.p) * 8;
        const y = q.y + bob, sway = rm ? 0 : Math.sin(t * 0.7 + q.p) * 6;
        cx.globalAlpha = rm ? 0.45 : 0.38 + Math.sin(t * 0.9 + q.p) * 0.12;
        drawFit(cx, gh, x0 + sway, y, 34, !!q.side);
      }
      cx.globalAlpha = 1;
    }
    // 박쥐: 몇 초마다 2~3마리가 위쪽을 가로질러 간다
    const bat = img(a.bat);
    if (!rm && ok(bat)) {
      S.batT -= dt;
      if (S.batT <= 0 && S.bats.length < 4) {
        S.batT = 5 + rnd() * 6;
        const dir = rnd() < 0.5 ? 1 : -1, y = top + rnd() * 70, n = 2 + (rnd() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) S.bats.push({ x: dir > 0 ? -30 - i * 26 : W + 30 + i * 26, y: y + i * 12, v: dir * (70 + rnd() * 30), p: rnd() * TAU, s: 0.7 + rnd() * 0.4 });
      }
      for (const b of S.bats) {
        b.x += b.v * dt;
        const w = 30 * b.s, h = w * (bat.naturalHeight / bat.naturalWidth), fl = 0.6 + 0.4 * Math.abs(Math.sin(t * 14 + b.p));
        const y = b.y + Math.sin(t * 3 + b.p) * 6;
        cx.save(); cx.translate(b.x, y); if (b.v < 0) cx.scale(-1, 1); cx.scale(1, fl);
        cx.globalAlpha = 0.85; cx.drawImage(bat, -w / 2, -h / 2, w, h); cx.restore();
      }
      S.bats = S.bats.filter((b) => b.x > -80 && b.x < W + 80);
      cx.globalAlpha = 1;
    }
    return;
  }
  if (layer === 'gate' && g) {
    // 바리케이드 양 끝: 호박등 + 촛불 (멤버 줄과 길은 가리지 않게 가장자리만)
    const by = g.ropeY + 8;
    const pk = img(a.pumpkin), cd = img(a.candle);
    const fl = rm ? 1 : 0.8 + Math.sin(t * 11) * 0.1 + Math.sin(t * 17.3) * 0.08;
    cx.globalCompositeOperation = 'lighter';
    for (const [px, r] of [[18, 26], [W - 18, 26], [46, 16], [W - 46, 16]]) {
      const gr = cx.createRadialGradient(px, by - 14, 0, px, by - 14, r);
      gr.addColorStop(0, `rgba(255,170,60,${0.42 * fl})`); gr.addColorStop(1, 'rgba(255,120,30,0)');
      cx.fillStyle = gr; cx.fillRect(px - r, by - 14 - r, r * 2, r * 2);
    }
    cx.globalCompositeOperation = 'source-over';
    drawFit(cx, pk, 18, by, 34, false);
    drawFit(cx, pk, W - 18, by, 34, true);
    drawFit(cx, cd, 46, by - 2, 20, false);
    drawFit(cx, cd, W - 46, by - 2, 20, true);
  }
}
