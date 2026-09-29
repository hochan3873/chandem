// 랑방 대전 — 공유하기: 초대 링크(미리보기 이미지는 index.html의 og:image) · 결과 카드 이미지
const URL_ = location.origin + '/langbang/';
const TITLE = '랑방 대전';
const INVITE = '⚔️ 랑방 대전 도전장! 진상들로부터 우리 아지트 랑방을 같이 지키자 👉';
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

export function shareInvite() { return shareText(INVITE); }

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

// r: { title, win, mode('stage'|'endless'), stageLabel, stars, score, wave, waves, kills, bossKills, time, nickname, heroes:[{img,name,color}] }
export async function drawCard(r) {
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  try { await Promise.all([document.fonts.load(`900 60px ${FONT}`), document.fonts.load(`700 30px ${FONT}`)]); } catch { /* 기본 글꼴 */ }
  const [bg, icon, ...heroImgs] = await Promise.all([
    loadImg('/img/games/langbang.webp'), loadImg('/img/icon-192.png'), ...r.heroes.map((h) => loadImg(h.img)),
  ]);

  ctx.fillStyle = '#0b0a16';
  ctx.fillRect(0, 0, W, H);
  if (bg) {
    const s = Math.max(W / bg.width, 620 / bg.height);
    const bw = bg.width * s, bh = bg.height * s;
    ctx.drawImage(bg, (W - bw) * 0.62, 0, bw, bh);
  }
  let gr = ctx.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, 'rgba(11,10,22,.55)');
  gr.addColorStop(0.3, 'rgba(11,10,22,.25)');
  gr.addColorStop(0.46, 'rgba(11,10,22,.95)');
  gr.addColorStop(1, '#0b0a16');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = 'middle';
  // 머리: 게임월드 + 랑방 대전
  if (icon) { ctx.save(); rr(ctx, 56, 52, 72, 72, 16); ctx.clip(); ctx.drawImage(icon, 56, 52, 72, 72); ctx.restore(); }
  ctx.font = `900 34px ${FONT}`;
  ctx.fillStyle = '#ffd6f3';
  ctx.textAlign = 'left';
  ctx.fillText('찬이의 게임월드', 146, 90);
  ctx.textAlign = 'center';
  ctx.font = `900 124px ${FONT}`;
  ctx.lineWidth = 16;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#2a0b38';
  ctx.strokeText(TITLE, W / 2, 470);
  gr = ctx.createLinearGradient(0, 410, 0, 530);
  gr.addColorStop(0, '#fff6a8'); gr.addColorStop(0.6, '#ffb03a'); gr.addColorStop(1, '#ff6a3a');
  ctx.fillStyle = gr;
  ctx.fillText(TITLE, W / 2, 470);

  // 결과 제목
  ctx.font = `900 64px ${FONT}`;
  ctx.fillStyle = r.win ? '#7dffb0' : '#ffb3c8';
  ctx.fillText(r.title, W / 2, 590);
  ctx.font = `700 30px ${FONT}`;
  ctx.fillStyle = '#cfc3ea';
  ctx.fillText(r.nickname ? `${r.nickname} 님의 기록` : '나의 기록', W / 2, 650);

  // 가운데 큰 칸: 스테이지 = 별, 무한 도전 = 점수
  rr(ctx, 90, 700, W - 180, 170, 36);
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,214,110,.5)';
  ctx.lineWidth = 3;
  ctx.stroke();
  const stageMode = r.mode === 'stage';
  if (stageMode) {
    ctx.font = `700 30px ${FONT}`;
    ctx.fillStyle = '#ffd66e';
    ctx.fillText(`스테이지 ${r.stageLabel}${r.win ? ' 클리어' : ''}`, W / 2, 742);
    ctx.font = `900 96px ${FONT}`;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < (r.stars || 0) ? '#ffd23f' : 'rgba(255,255,255,.16)';
      ctx.fillText('★', W / 2 + (i - 1) * 120, 818);
    }
  } else {
    ctx.font = `700 30px ${FONT}`;
    ctx.fillStyle = '#ffd66e';
    ctx.fillText('♾ 무한 도전 점수', W / 2, 742);
    ctx.font = `900 92px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(fmt(r.score), W / 2, 815);
  }

  // 통계 4칸
  const stats = [[stageMode ? '웨이브' : '도달 웨이브', stageMode ? `${r.wave}/${r.waves || 5}` : r.wave], ['처치', fmt(r.kills)], [stageMode ? '점수' : '보스', stageMode ? fmt(r.score) : r.bossKills], ['시간', r.time]];
  const cw = (W - 180 - 3 * 20) / 4;
  stats.forEach(([k, v], i) => {
    const x = 90 + i * (cw + 20);
    rr(ctx, x, 900, cw, 140, 26);
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.fill();
    ctx.font = `700 26px ${FONT}`;
    ctx.fillStyle = '#a99cc8';
    ctx.fillText(k, x + cw / 2, 940);
    ctx.font = `900 ${String(v).length > 5 ? 40 : 50}px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(String(v), x + cw / 2, 998);
  });

  // 출전 멤버
  const n = r.heroes.length;
  const size = n > 4 ? 104 : 124, gap = 22;
  const total = n * size + (n - 1) * gap;
  r.heroes.forEach((h, i) => {
    const x = (W - total) / 2 + i * (size + gap), y = 1080;
    ctx.save();
    rr(ctx, x, y, size, size, 26);
    ctx.fillStyle = h.color || '#3a2a5a';
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.clip();
    if (heroImgs[i]) {
      const im = heroImgs[i];
      const s = Math.max(size / im.width, size / im.height) * 1.05;
      ctx.drawImage(im, x + (size - im.width * s) / 2, y + size - im.height * s + 4, im.width * s, im.height * s);
    }
    ctx.restore();
    if (i === 0) {
      ctx.font = `900 22px ${FONT}`;
      ctx.fillStyle = '#ffd66e';
      ctx.fillText('MVP', x + size / 2, y - 16);
    }
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = '#e8ddff';
    ctx.fillText(h.name, x + size / 2, y + size + 22);
  });

  // 발문
  gr = ctx.createLinearGradient(0, 1262, 0, 1330);
  gr.addColorStop(0, '#ff8fd8'); gr.addColorStop(1, '#d9368f');
  rr(ctx, 150, 1262, W - 300, 68, 34);
  ctx.fillStyle = gr;
  ctx.fill();
  ctx.font = `900 30px ${FONT}`;
  ctx.fillStyle = '#fff';
  ctx.fillText('이 기록 깰 수 있어? chandem.onrender.com/langbang', W / 2, 1297);

  return new Promise((res) => cv.toBlob((b) => res(b), 'image/jpeg', 0.9));
}

// 결과 공유 창: 카드를 미리 만들어 두고, 버튼을 누른 순간 바로 공유 시트를 연다 (iOS는 사용자 동작 직후만 허용)
export async function openResultShare(r, host) {
  closeShare();
  const box = document.createElement('div');
  box.className = 'share-modal';
  box.innerHTML = `<div class="share-box">
      <div class="share-img"><span class="spin">⏳</span> 결과 카드 만드는 중…</div>
      <p class="share-tip">이미지를 길게 눌러도 저장할 수 있어요</p>
      <button class="btn primary" data-s="share" disabled>📤 공유하기</button>
      <div class="share-row"><button class="btn" data-s="save" disabled>💾 이미지 저장</button><button class="btn" data-s="copy">🔗 링크 복사</button></div>
      <button class="btn ghost" data-s="close">닫기</button>
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
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
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
  if (!blob) { holder.textContent = '이미지를 만들지 못했어요 — 링크로 공유해 주세요'; box.querySelector('[data-s=share]').disabled = false; return; }
  file = new File([blob], `langbang-${r.mode === 'stage' ? r.stageLabel : 'endless-' + r.wave}.jpg`, { type: 'image/jpeg' });
  url = URL.createObjectURL(blob);
  box._url = url;
  holder.innerHTML = `<img src="${url}" alt="랑방 대전 결과 카드">`;
  for (const el of box.querySelectorAll('[data-s]')) el.disabled = false;
}

// 공유 문구: "스테이지 2-7 클리어 ★★★" / "무한 도전 웨이브 24 · 점수 123,456점"
export function shareLine(r) {
  if (r.mode === 'stage') {
    const st = '★'.repeat(r.stars || 0) + '☆'.repeat(3 - (r.stars || 0));
    return r.win ? `⚔️ 랑방 대전 스테이지 ${r.stageLabel} 클리어 ${st} — 이 기록 깰 수 있어?` : `⚔️ 랑방 대전 스테이지 ${r.stageLabel} 도전 중! 같이 막아 줄 사람?`;
  }
  return `⚔️ 랑방 대전 무한 도전 웨이브 ${r.wave} · 점수 ${fmt(r.score)}점 — 이 기록 깰 수 있어?`;
}

export function closeShare() {
  for (const m of document.querySelectorAll('.share-modal')) {
    if (m._url) URL.revokeObjectURL(m._url);
    m.remove();
  }
}
