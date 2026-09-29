// 첫 로딩 화면(스플래시): 글꼴·메인 그림·소리를 미리 받으면서 진행 막대를 채우고,
// 다 되면 "화면을 터치해서 시작" → 그 터치로 소리를 풀어서(자동 재생 막힘 해결) 메인 배경음악이 바로 나온다.
// 한 세션에 한 번만 (sessionStorage 'gw:splashed'). 이미 받아 둔 게 많아 0.6초 안에 끝나면 막대 없이 바로 터치 화면.
import * as sound from './sound.js';

const html = document.documentElement;
const el = document.getElementById('splash');
const FAST_MS = 600;       // 이 안에 다 받으면 진행 막대를 건너뜀
const MAX_MS = 6000;       // 느린 인터넷이어도 이만큼 지나면 시작할 수 있게
const ITEM_MAX_MS = 5000;  // 파일 하나 최대 대기

const TIPS = [
  '팁: 랑방 대전은 상성 맞는 팀이 유리해요',
  '팁: 매일 📅 출석 체크하면 랑방 코인을 받아요. 7일째엔 300개!',
  '팁: 친구에게 초대 링크만 보내면 가입 없이 바로 같이 놀 수 있어요',
  '팁: 혼자일 땐 🤖 AI와 연습하기로 봇과 한 판!',
  '팁: 섯다는 세 장 섯다도 있어요. 좋은 두 장을 자동으로 골라 줘요',
  '팁: 오목에서 흑은 삼삼 금지! 로그인하면 티어가 올라가요',
  '팁: 로그인하면 전적과 랭킹이 쌓여요',
  '팁: ⚙️ 설정에서 배경음악·진동을 끄고 켤 수 있어요',
  '팁: 📲 앱 설치를 하면 전체 화면으로 더 편하게 놀 수 있어요',
];

function start() {
  if (!el || !html.classList.contains('splashing')) { if (el) el.remove(); return; }
  const t0 = performance.now();
  const bar = el.querySelector('.sp-bar i');
  const pctEl = el.querySelector('[data-sp-pct]');
  const whatEl = el.querySelector('[data-sp-what]');
  const tipEl = el.querySelector('[data-sp-tip]');

  // ── 팁 돌리기 ──
  let tipI = Math.floor(Math.random() * TIPS.length);
  tipEl.textContent = TIPS[tipI];
  const tipTimer = setInterval(() => {
    tipEl.classList.add('swap');
    setTimeout(() => { tipI = (tipI + 1) % TIPS.length; tipEl.textContent = TIPS[tipI]; tipEl.classList.remove('swap'); }, 250);
  }, 2600);

  // ── 미리 받기 ──
  const withTimeout = (p) => Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, ITEM_MAX_MS))]);
  const img = (src, onErr) => new Promise((res) => {
    const i = new Image();
    i.onload = () => { if (i.decode) i.decode().then(res, res); else res(); };
    i.onerror = () => { if (onErr) onErr(); res(); };
    i.src = src;
  });
  const font = (spec) => (document.fonts && document.fonts.load ? document.fonts.load(spec, '찬이의 게임월드 ABC') : Promise.resolve());
  const get = (url) => fetch(url, { cache: 'force-cache' }).then((r) => r.blob());
  const audioReady = (src) => new Promise((res) => {
    const a = new Audio();
    a.preload = 'auto';
    a.muted = true;
    a.oncanplay = res; a.onerror = res; // 앞부분만 받아 두면 충분 (전체 곡을 기다리지 않음)
    a.src = src;
    a.load();
  });
  const jobs = [
    ['그림', img('/img/splash.webp', () => el.classList.add('no-art'))],
    ['글꼴', font("400 1em 'Black Han Sans'")],
    ['글꼴', font("700 1em 'Noto Sans KR'")],
    ['그림', img('/img/gw-icon-192.png')],
    ['그림', img('/img/bg-lobby.webp')],
    ['그림', img('/img/games/langbang.webp')],
    ['그림', img('/img/games/holdem.webp')],
    ['그림', img('/img/games/seotda.webp')],
    ['그림', img('/img/games/omok.webp')],
    ['소리', get('/sounds/manifest.json')],
    ['소리', audioReady('/sounds/bgm_hub.mp3')],
  ];
  let done = 0;
  let shown = 0;           // 화면에 보이는 진행률 (부드럽게 따라감)
  let target = 0;
  let fast = true;
  const total = jobs.length;
  for (const [what, p] of jobs) {
    withTimeout(p).then(() => {
      done++;
      target = done / total;
      if (whatEl && done < total) whatEl.textContent = `${what} 받는 중… (${done}/${total})`;
    });
  }
  // 느리면(0.6초 넘으면) 진행 막대 보이기
  const slowTimer = setTimeout(() => { fast = false; el.classList.add('loading'); }, FAST_MS);

  let raf = 0;
  const tick = () => {
    shown += (target - shown) * 0.18 + (target > shown ? 0.002 : 0);
    if (shown > target) shown = target;
    const pct = Math.round(shown * 100);
    bar.style.width = pct + '%';
    pctEl.textContent = pct + '%';
    if (done >= total && (fast || shown >= 0.999)) { finishLoading(); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const maxTimer = setTimeout(() => { target = 1; done = total; }, MAX_MS);

  let ready = false;
  function finishLoading() {
    if (ready) return;
    ready = true;
    cancelAnimationFrame(raf);
    clearTimeout(slowTimer); clearTimeout(maxTimer);
    bar.style.width = '100%'; pctEl.textContent = '100%';
    el.classList.add('ready');
    el.setAttribute('aria-label', '화면을 터치해서 시작');
    window.__gwSplash = { ready: true, ms: Math.round(performance.now() - t0), fast };
  }

  // ── 터치해서 시작 ──
  let closed = false;
  function go(e) {
    if (!ready || closed) return;
    if (e && e.type === 'keydown' && !['Enter', ' ', 'Spacebar'].includes(e.key)) return;
    closed = true;
    sound.unlock(); // 이 터치 안에서 소리 풀기 → 메인 배경음악 시작
    try { sessionStorage.setItem('gw:splashed', '1'); } catch {}
    clearInterval(tipTimer);
    el.classList.add('done');
    const end = () => { el.remove(); html.classList.remove('splashing'); window.dispatchEvent(new Event('gw:splash-done')); };
    if (window.gwSettings && window.gwSettings.reduceMotion()) end(); else setTimeout(end, 460);
  }
  el.addEventListener('click', go);
  el.addEventListener('keydown', go);
  el.focus({ preventScroll: true });
}

start();
