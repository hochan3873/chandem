// 랑방 대전 — 앱 설치 (홈 화면에 추가)
//  안드로이드 크롬·삼성 인터넷: 버튼 하나로 바로 설치 창 · 아이폰: 사파리 3단계 그림 안내 · 카톡 등 앱 안 브라우저: 바깥 브라우저로 여는 법
//  설치한 앱으로 열면 버튼은 숨는다. 로비 위쪽 [앱 설치] → open()
const UA = navigator.userAgent || '';
const IS_IOS = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh|MacIntel/.test(UA + navigator.platform) && navigator.maxTouchPoints > 1);
const IS_KAKAO = /KAKAOTALK/i.test(UA);
const IN_APP = IS_KAKAO || /NAVER|Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps|everytimeApp/i.test(UA);
const IOS_OTHER = IS_IOS && /CriOS|FxiOS|EdgiOS|OPiOS|Whale/i.test(UA);
const URL0 = location.origin + '/langbang/';
let C = null; // { popup(html, cls) → 창, toast(msg, ms), closeInfoCard() }
let evt = null; // 크롬이 준 설치 창 (beforeinstallprompt)

export const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true || /source=app/.test(location.search);
export function initInstall(ctx) {
  C = ctx;
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); evt = e; });
  window.addEventListener('appinstalled', () => { evt = null; for (const b of document.querySelectorAll('[data-act="lbInstall"]')) b.remove(); C.toast('랑방 대전 앱을 설치했어요! 바탕화면 아이콘으로 열어 보세요', 3200); });
  return { open, standalone };
}
async function copyLink() {
  try { await navigator.clipboard.writeText(URL0); C.toast('링크를 복사했어요 · 사파리(또는 크롬) 주소창에 붙여 넣어 주세요', 2600); }
  catch { C.toast(URL0, 5000); }
}
const SVG_SHARE = '<svg class="ins-ico" viewBox="0 0 40 40" aria-hidden="true"><rect x="9" y="14" width="22" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M20 4v19M13 10l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_ADD = '<svg class="ins-ico" viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="6" width="28" height="28" rx="7" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M20 13v14M13 20h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
const SVG_DOTS = '<svg class="ins-ico" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="9" r="3.4" fill="currentColor"/><circle cx="20" cy="20" r="3.4" fill="currentColor"/><circle cx="20" cy="31" r="3.4" fill="currentColor"/></svg>';
const head = '<div class="ins-head"><img src="/img/lb/app/icon-192.png" alt="" draggable="false"><div><b>랑방 대전</b><small>바탕화면 아이콘으로 바로 열고 · 전체 화면으로 더 크게</small></div></div>';
const steps = (list) => `<ol class="ins-steps">${list.map(([ico, t], i) => `<li><i class="ins-n">${i + 1}</i>${ico ? `<span class="ins-key">${ico}</span>` : ''}<p>${t}</p></li>`).join('')}</ol>`;
const sheet = (body, btns = '') => { const m = C.popup(`<h3>앱으로 설치하기</h3>${head}${body}${btns ? `<div class="ins-btns">${btns}</div>` : ''}`, 'lb-sheet ins-sheet'); const cp = m.querySelector('[data-ins="copy"]'); if (cp) cp.onclick = copyLink; const go = m.querySelector('[data-ins="go"]'); if (go) go.onclick = () => { C.closeInfoCard(); open(); }; return m; };

export async function open() {
  if (standalone()) { C.toast('이미 앱으로 열려 있어요', 1600); return; }
  // 카톡 · 네이버 등 앱 안 브라우저: 여기서는 설치가 안 된다 → 바깥 브라우저로
  if (IN_APP) {
    const ext = IS_KAKAO ? `<a class="btn primary" href="kakaotalk://web/openExternal?url=${encodeURIComponent(URL0)}">바깥 브라우저로 열기</a>` : '';
    sheet(`<p class="ins-warn"><b>${IS_KAKAO ? '카카오톡' : '앱'} 안의 화면</b>에서는 설치할 수 없어요. <b>${IS_IOS ? '사파리' : '크롬'}로 열어서</b> 다시 [앱 설치]를 눌러 주세요.</p>
      ${steps([[SVG_DOTS, IS_KAKAO ? '오른쪽 아래(또는 위) <b>⋯</b> 버튼' : '메뉴 <b>⋯</b> 버튼'], [null, `<b>「다른 브라우저로 열기」</b>${IS_IOS ? ' → 사파리' : ' → 크롬'}`], [null, '열린 화면에서 로비 위 <b>[앱 설치]</b>']])}`,
      `${ext}<button class="btn" data-ins="copy">링크 복사</button>`);
    return;
  }
  if (IS_IOS) {
    const bar = IOS_OTHER ? '주소창 오른쪽' : '화면 아래 막대';
    sheet(`${steps([[SVG_SHARE, `${bar}의 <b>공유</b> 버튼 (네모에 위 화살표)`], [SVG_ADD, '목록을 내려서 <b>「홈 화면에 추가」</b><small>안 보이면 맨 아래 「작업 편집」 · 「더 보기」 안에 있어요</small>'], [null, '오른쪽 위 <b>「추가」</b> → 바탕화면의 <b>랑방 대전</b> 아이콘으로 열면 끝!']])}
      <p class="ins-note">아이폰은 애플 정책상 버튼 하나로 바로 설치가 안 돼서 이 3단계로 넣어요</p>`);
    return;
  }
  // 안드로이드 크롬 · 삼성 인터넷: 설치 창이 준비돼 있으면 바로
  if (evt) {
    const e = evt; evt = null;
    e.prompt();
    const r = await e.userChoice.catch(() => null);
    if (r && r.outcome === 'accepted') C.toast('설치하는 중이에요… 끝나면 바탕화면에 랑방 대전 아이콘이 생겨요', 3200);
    return;
  }
  // 설치 창이 아직 없을 때 (이미 설치했거나 · 브라우저가 아직 준비 전): 메뉴로 직접
  sheet(`${steps([[SVG_DOTS, '오른쪽 위 <b>⋮</b> (삼성 인터넷은 아래 <b>≡</b>)'], [SVG_ADD, '<b>「앱 설치」</b> 또는 <b>「홈 화면에 추가」</b>'], [null, '<b>「설치」</b> → 바탕화면의 <b>랑방 대전</b> 아이콘으로 열면 끝!']])}
    <p class="ins-note">이미 설치했다면 바탕화면이나 앱 목록에서 <b>랑방 대전</b>을 찾아 열어 주세요</p>`);
}
