// 랑방 대전 — 공유하기: 초대 링크(미리보기 이미지는 index.html의 og:image) · 결과 카드 이미지
const URL_ = location.origin + '/langbang/';
const TITLE = '랑방 대전';
const INVITE = '랑방 대전 도전장! 진상들로부터 우리 아지트 랑방을 같이 지키자 ';
const FONT = "'Noto Sans KR', sans-serif";

let toastFn = () => {};
export function setToast(fn) { toastFn = fn; }

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* 아래로 */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

// 공유 시트 → 안 되면 링크 복사. 사용자가 닫은 건 조용히 넘어간다
async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ title: TITLE, text, url: URL_ }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const ok = await copy(`${text} ${URL_}`);
  toastFn(ok ? '링크를 복사했어요! 카톡방에 붙여 넣어 주세요' : `이 주소를 친구에게 보내 주세요: ${URL_}`, 3000);
}

// 공유하기: 랑방 대전 링크 · 찬이의 게임월드 링크 중에서 고른다 (카톡 미리보기는 각 index.html 의 og:image)
const WORLD_URL = location.origin + '/';
const WORLD_TEXT = '찬이의 게임월드 — 우리 모임 친구들과 랑방 대전 · 홀덤 · 섯다 · 오목 한 판! ';
async function shareUrl(url, title, text) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const ok = await copy(`${text} ${url}`);
  toastFn(ok ? '링크를 복사했어요! 카톡방에 붙여 넣어 주세요' : `이 주소를 친구에게 보내 주세요: ${url}`, 3000);
}
export function shareInvite() {
  closeShare();
  const box = document.createElement('div');
  box.className = 'share-pick';
  box.innerHTML = `<div class="sp-card"><h3>공유하기</h3>
    <button class="sp-opt" data-sp="lb"><img src="/img/og-lb4.jpg" alt="" draggable="false"><span><b>랑방 대전</b><small>바로 게임으로 들어오는 링크</small></span></button>
    <button class="sp-opt" data-sp="gw"><img src="/img/og-gw4.jpg" alt="" draggable="false"><span><b>찬이의 게임월드</b><small>랑방 대전 · 홀덤 · 섯다 · 오목 모음</small></span></button>
    <button class="sp-x" data-sp="x">닫기</button></div>`;
  box.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-sp]');
    if (ev.target === box || (b && b.dataset.sp === 'x')) { box.remove(); return; }
    if (!b) return;
    box.remove();
    if (b.dataset.sp === 'lb') shareText(INVITE);
    else shareUrl(WORLD_URL, '찬이의 게임월드', WORLD_TEXT);
  });
  document.body.appendChild(box);
}

// ─── 결과 카드 ───────────────────────────────────────
function loadImg(src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');

// 작은 QR (주소는 고정 → 미리 만든 칸 무늬 · 29×29)
const QR = ['8tja7z', '4is30h', '6hf599', '6h94kd', '6h1gm5', '4jg475', '8tz2pr', '1720w', '6lllrw', '5uxsdt', 'djn5s', '2s1xuy', '7h1dl8', '5abqb5', '4ojek', '7crg2a', '2bse18', '5lt3hx', '5ms9ck', '5vexaa', '59h43b', 'norj', '8t993w', '4jfmkw', '6hgph0', '6hevf3', '6gxqf2', '4ihai2', '8u2j10'];
function drawQR(ctx, x, y, size) {
  const n = QR.length, c = size / (n + 2);
  ctx.fillStyle = '#fff'; rr(ctx, x, y, size, size, 10); ctx.fill();
  ctx.fillStyle = '#1a0b1f';
  QR.forEach((row, yy) => { const bits = parseInt(row, 36).toString(2).padStart(n, '0'); for (let xx = 0; xx < n; xx++) if (bits[xx] === '1') ctx.fillRect(x + c * (xx + 1), y + c * (yy + 1), Math.ceil(c), Math.ceil(c)); });
}
const HEAVY = "'Black Han Sans', 'Pretendard Variable', sans-serif", BODY = "'Pretendard Variable', Pretendard, 'Noto Sans KR', sans-serif";
// 외곽선 글씨 (캔버스): 굵은 테두리 → 채우기
function olText(ctx, t, x, y, fill, ol = '#1a0b1f', w = 10) { ctx.lineJoin = 'round'; ctx.lineWidth = w; ctx.strokeStyle = ol; ctx.strokeText(t, x, y); ctx.fillStyle = fill; ctx.fillText(t, x, y); }
// r: { title, win, mode, stageLabel, stars, score, wave, waves, kills, bossKills, time, nickname, chapter, heroes:[{id,img,thumb,face,name,color,tier}] }
export async function drawCard(r) {
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  try { await Promise.all([document.fonts.load(`400 80px 'Black Han Sans'`), document.fonts.load(`700 30px 'Pretendard Variable'`)]); await document.fonts.ready; } catch { /* 기본 글꼴 */ }
  const [bg, logo, world, star, starDim, crown, ...faces] = await Promise.all([
    loadImg(r.chapter ? `/img/lb/keyart${r.chapter}.webp` : '/img/lb/title_poster.jpg').then((im) => im || loadImg('/img/lb/title_poster.jpg')),
    loadImg('/img/lb/logo_langbang.webp'), loadImg('/img/hub/logo_world.webp'), loadImg('/img/lb/ui2/star_gold.webp'), loadImg('/img/lb/ui2/star_gold.webp'), loadImg('/img/lb/ui2/crown.webp'),
    ...r.heroes.map((h) => loadImg(h.thumb || h.img).then((im) => im || loadImg(h.img))),
  ]);
  ctx.fillStyle = '#0b0a16'; ctx.fillRect(0, 0, W, H);
  if (bg) { const sc = Math.max(W / bg.width, 860 / bg.height); const bw = bg.width * sc, bh = bg.height * sc; ctx.drawImage(bg, (W - bw) / 2, 20, bw, bh); }
  let gr = ctx.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, 'rgba(11,10,22,.35)'); gr.addColorStop(0.32, 'rgba(11,10,22,.15)'); gr.addColorStop(0.52, 'rgba(11,10,22,.94)'); gr.addColorStop(1, '#0b0a16');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  // 로고 · 게임월드 표시
  if (logo) { const lw = 620, lh = lw * (logo.height / logo.width); ctx.drawImage(logo, (W - lw) / 2, 30, lw, lh); }
  if (world) { const ww = 150, wh = ww * (world.height / world.width); ctx.globalAlpha = 0.9; ctx.drawImage(world, W - ww - 36, 36, ww, wh); ctx.globalAlpha = 1; }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // 제목: 별에 따라 금 · 은 · 동
  const stageMode = r.mode === 'stage', st = r.stars | 0;
  const head = stageMode ? (r.win ? `${r.stageLabel} 클리어!` : `${r.stageLabel} 도전 중`) : r.title;
  const col = stageMode && r.win ? (st >= 3 ? '#ffd23f' : st === 2 ? '#e6ecf5' : '#e0a070') : '#ffffff';
  ctx.font = `400 ${head.length > 9 ? 88 : 112}px ${HEAVY}`;
  olText(ctx, head, W / 2, 560, col, '#1a0b1f', 16);
  // 이름표 띠
  const nm = r.nickname ? `${r.nickname} 님의 기록` : '나의 기록';
  ctx.font = `700 32px ${BODY}`;
  const tw = Math.min(W - 200, ctx.measureText(nm).width + 90);
  gr = ctx.createLinearGradient(0, 612, 0, 668); gr.addColorStop(0, '#7a4ad8'); gr.addColorStop(1, '#4a1fa0');
  ctx.fillStyle = gr; rr(ctx, (W - tw) / 2, 612, tw, 56, 28); ctx.fill();
  ctx.strokeStyle = 'rgba(255,214,110,.8)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillText(nm, W / 2, 641);
  // 별 (스테이지) / 큰 점수 (그 밖)
  if (stageMode) {
    for (let i = 0; i < 3; i++) { const sx = W / 2 + (i - 1) * 150 - 64, sy = 690; if (star) { ctx.globalAlpha = i < st ? 1 : 0.22; if (i >= st) ctx.filter = 'grayscale(1)'; ctx.drawImage(i < st ? star : starDim, sx, sy, 128, 128); ctx.filter = 'none'; ctx.globalAlpha = 1; } }
  } else {
    ctx.font = `700 30px ${BODY}`; ctx.fillStyle = '#ffd66e'; ctx.fillText(r.mode === 'endless' ? '무한 도전 점수' : '기록', W / 2, 712);
    ctx.font = `400 104px ${HEAVY}`; olText(ctx, fmt(r.score || 0), W / 2, 780, '#fff', '#1a0b1f', 12);
  }
  // 유리 칸 4개: 웨이브 · 처치 · 점수 · 시간
  const stats = [['웨이브', stageMode ? `${r.wave}/${r.waves || 5}` : String(r.wave)], ['처치', fmt(r.kills || 0)], [stageMode ? '점수' : '보스', stageMode ? fmt(r.score || 0) : String(r.bossKills || 0)], ['시간', String(r.time || '-')]];
  const cw = (W - 180 - 3 * 18) / 4;
  stats.forEach(([k, v], i) => {
    const x = 90 + i * (cw + 18), y = 850;
    ctx.fillStyle = 'rgba(255,255,255,.08)'; rr(ctx, x, y, cw, 140, 26); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = `700 26px ${BODY}`; ctx.fillStyle = '#b9addb'; ctx.fillText(k, x + cw / 2, y + 40);
    ctx.font = `400 ${String(v).length > 6 ? 40 : 52}px ${HEAVY}`; olText(ctx, String(v), x + cw / 2, y + 96, '#fff', '#1a0b1f', 7);
  });
  // 멤버: 그림 얼굴 · 등급 테두리 · MVP 왕관 · 금 테두리
  const n = r.heroes.length, size = n > 5 ? 118 : 136, gap = 20, total = n * size + (n - 1) * gap;
  const TC = ['#9aa1a8', '#9aa1a8', '#5de07a', '#4ea8ff', '#c77dff', '#ffcf3f'];
  r.heroes.forEach((h, i) => {
    const x = (W - total) / 2 + i * (size + gap), y = 1045, im = faces[i];
    ctx.save(); rr(ctx, x, y, size, size, 26); ctx.fillStyle = '#2a1c4a'; ctx.fill(); ctx.clip();
    if (im) { const f = h.face || [0.48, 0.09, 0.14]; const hh = (size * 0.55) / f[2], ww = hh * (im.width / im.height); ctx.drawImage(im, x + size / 2 - f[0] * ww, y + size * 0.48 - f[1] * hh, ww, hh); }
    ctx.restore();
    ctx.lineWidth = i === 0 ? 7 : 5; ctx.strokeStyle = i === 0 ? '#ffd23f' : TC[h.tier | 0] || '#9aa1a8'; rr(ctx, x, y, size, size, 26); ctx.stroke();
    if (i === 0) { if (crown) ctx.drawImage(crown, x + size / 2 - 32, y - 50, 64, 64); ctx.font = `400 22px ${HEAVY}`; olText(ctx, 'MVP', x + size / 2, y + size - 16, '#ffd23f', '#1a0b1f', 6); }
    ctx.font = `700 24px ${BODY}`; ctx.fillStyle = '#e8ddff'; ctx.fillText(h.name, x + size / 2, y + size + 26);
  });
  // 도전장 띠 + QR
  gr = ctx.createLinearGradient(0, 1238, 0, 1318); gr.addColorStop(0, '#3a2a66'); gr.addColorStop(1, '#1e1438');
  ctx.fillStyle = gr; rr(ctx, 70, 1234, W - 250, 86, 43); ctx.fill();
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.stroke();
  ctx.textAlign = 'left';
  ctx.font = `900 34px ${BODY}`; olText(ctx, '이 기록 깰 수 있어?', 110, 1263, '#ffd23f', '#1a0b1f', 6);
  ctx.font = `700 24px ${BODY}`; ctx.fillStyle = '#d8ccff'; ctx.fillText(URL_.replace(/^https?:\/\//, ''), 110, 1298);
  drawQR(ctx, W - 160, 1216, 122);
  return new Promise((res) => cv.toBlob((b) => res(b), 'image/jpeg', 0.9));
}
const ic = (name) => `<img class="ic sm" src="/img/lb/ui2/${name}.webp" alt="" draggable="false">`;

// 결과 공유 창: 카드를 미리 만들어 두고, 버튼을 누른 순간 바로 공유 시트를 연다 (iOS는 사용자 동작 직후만 허용)
export async function openResultShare(r, host) {
  closeShare();
  const box = document.createElement('div');
  box.className = 'share-modal v2';
  box.innerHTML = `<div class="share-box">
      <div class="share-img share-keep"><span class="spin">${ic('hourglass')}</span> 결과 카드 만드는 중</div>
      <button class="sh-main" data-s="share" disabled>${ic('share')}<b>공유하기</b></button>
      <div class="share-row"><button class="sh-sub" data-s="save" disabled>${ic('gift')}이미지 저장</button><button class="sh-sub" data-s="copy">${ic('tag')}링크 복사</button></div>
      <button class="sh-close" data-s="close">닫기</button>
      <p class="share-tip">이미지를 길게 눌러도 저장돼요</p>
    </div>`;
  host.appendChild(box);
  const text = shareLine(r);
  let file = null, url = '';
  box.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-s]');
    if (ev.target === box) { closeShare(); return; }
    if (!b || b.disabled) return;
    const s = b.dataset.s;
    if (s === 'close') closeShare();
    else if (s === 'copy') {
      const ok = await copy(`${text} ${URL_}`);
      toastFn(ok ? '기록과 링크를 복사했어요!' : `주소: ${URL_}`, 2600);
    } else if (s === 'save') {
      const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    } else if (s === 'share') {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: TITLE, text: `${text}\n${URL_}` }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
      }
      shareText(text); // 이미지 공유가 안 되는 곳(카톡 인앱·PC 등)은 링크+기록으로
    }
  });
  const blob = await drawCard(r).catch(() => null);
  if (!box.isConnected) return;
  const holder = box.querySelector('.share-img');
  if (!blob) { holder.textContent = '이미지를 만들지 못했어요 · 링크로 공유해 주세요'; box.querySelector('[data-s=share]').disabled = false; return; }
  file = new File([blob], `langbang-${r.mode === 'stage' ? r.stageLabel : (r.mode || 'result') + '-' + (r.wave || 0)}.jpg`, { type: 'image/jpeg' });
  url = URL.createObjectURL(blob);
  box._url = url;
  holder.innerHTML = `<img src="${url}" alt="랑방 대전 결과 카드">`;
  for (const el of box.querySelectorAll('[data-s]')) el.disabled = false;
}

// 공유 문구: "스테이지 2-7 클리어 ★★★" / "무한 도전 웨이브 24 · 점수 123,456점"
export function shareLine(r) {
  if (r.mode === 'stage') {
    const st = '★'.repeat(r.stars || 0) + '☆'.repeat(3 - (r.stars || 0));
    return r.win ? `랑방 대전 스테이지 ${r.stageLabel} 클리어 ${st} — 이 기록 깰 수 있어?` : `랑방 대전 스테이지 ${r.stageLabel} 도전 중! 같이 막아 줄 사람?`;
  }
  return `랑방 대전 무한 도전 웨이브 ${r.wave} · 점수 ${fmt(r.score)}점 — 이 기록 깰 수 있어?`;
}

export function closeShare() {
  for (const m of document.querySelectorAll('.share-pick')) m.remove();
  for (const m of document.querySelectorAll('.share-modal')) {
    if (m._url) URL.revokeObjectURL(m._url);
    m.remove();
  }
}
