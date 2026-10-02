// 랑방 대전 — 화면 넘김 연출 (모바일 게임처럼: 목적지마다 다른 전환 · 탭하면 건너뛰기 · 움직임 줄이기 존중)
//  game.js show() 가 begin() → (새 화면 그리기) → after() 순서로 부른다. 새 화면 DOM 은 바로 바뀌고(상태 · 뒤로 가기 · 테스트가 그대로),
//  눈에 보이는 순서만 덮개(overlay)와 이전 화면 잔상(.tr-old)으로 연출한다.
//  - 진상의 탑: 탑 입구로 카메라가 빨려 들어감 + 붉은 안개 · 불씨 + 우르르 + 짧은 진동 → 탑 로비 / 나올 때는 반대로 빠져나옴
//  - 레이드: 엘리베이터 문이 닫혔다 열림 + 띵
//  - 1:1 대전: 빨강 · 파랑 대각선 VS 와이프
//  - 상점 · 모집: 셔터가 내려왔다 말려 올라감 + 반짝
//  - 그 밖: 옆으로 밀기 + 깊이감(이전 화면이 작아지며 흐려짐) + 패널 순서대로 등장
//  움직임은 transform · opacity 만 (흐림은 성능 좋은 기기에서만). 입력을 막는 건 덮는 동안(최대 0.45초)뿐이고, 그동안 탭하면 바로 끝낸다.
//  ?fastnav — 전환을 1/4 길이로 (테스트용)

let C = null; // { stage, ui, A, buzz(pattern), tips[] }
let cur = null; // 진행 중인 전환
const Q = new URLSearchParams(location.search);
const SPEED = Q.has('fastnav') ? 0.25 : 1;
const ms = (n) => Math.round(n * SPEED);
const LOW = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 2;
const TAB_SCR = new Set(['shop', 'bag', 'deck', 'members', 'missions', 'pvp']);
const ART = { tower: '/img/lb/tower_lobby.webp', raid: '/img/lb/map_raid.webp', pvp: '/img/lb/map_pvp.webp', shop: '/img/lb/loading_bg.webp', spark: '/img/lb/ui2/sparkle.webp' };
const NAME = { tower: '진상의 탑', raid: '건물주 레이드', pvp: '1:1 대전', shop: '상점' };

export function initTransit(ctx) {
  C = ctx;
  if (LOW) document.body.classList.add('tr-low');
  // 탑이 열려 있으면 로비가 한가할 때 탑 그림을 미리 받아 둔다 (처음 들어갈 때 기다리지 않게 · 84KB 한 장)
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  setTimeout(() => idle(() => { if (document.querySelector('.tw-entry:not(.locked), [data-act="lbModes"]')) { const im = new Image(); im.decoding = 'async'; im.src = ART.tower; } }), 2500);
  return { begin, after, finish, hold, leave, busy: () => !!(cur && cur.blocking) };
}
const reduced = () => document.body.classList.contains('rm');
const sfx = (k) => { try { if (C.A.sfx[k]) C.A.sfx[k](); } catch { /* 무시 */ } };
const buzz = (p) => { try { C.buzz(p); } catch { /* 무시 */ } };
const stageRect = () => C.stage.getBoundingClientRect();
function centerOf(el, sr) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2 };
}

// 어떤 전환을 쓸까
function themeOf(prev, next, kind) {
  if (prev === 'tower' && next === 'menu') return 'towerOut';
  if (kind === 'go-back') return 'generic';
  if (next === 'tower' && prev === 'menu') return 'towerIn';
  const fromTab = kind === 'go-tab' && TAB_SCR.has(prev);
  if (fromTab) return 'generic';
  if (next === 'raid') return 'raid';
  if (next === 'pvp') return 'pvp';
  if (next === 'shop') return 'shop';
  return 'generic';
}

// show() 가 새 화면을 그리기 전에: 이전 화면을 잔상으로 남길지 정한다 → { themed, keep }
function begin(prev, next, kind, oldEl) {
  finish();
  if (!prev || !oldEl || reduced()) return null;
  const theme = themeOf(prev, next, kind);
  const t = { theme, themed: theme !== 'generic', kind, prev, next, old: oldEl, keep: true, timers: [], anims: [], holds: [], blocking: false, done: false };
  const sr = stageRect();
  t.sr = sr;
  if (theme === 'towerIn') t.origin = centerOf(oldEl.querySelector('.tw-entry') || oldEl.querySelector('[data-act="lbModes"]'), sr); // 탑 버튼은 [도전] 시트 안 → 시트가 닫히면 [도전] 버튼 쪽으로
  // 이전 화면: 누를 수 없게 · 아이디 겹침 없게 (getElementById 가 새 화면을 찾도록)
  oldEl.classList.add('tr-old');
  oldEl.classList.remove('enter', 'same', 'go-fwd', 'go-back', 'go-tab');
  oldEl.inert = true;
  for (const e of oldEl.querySelectorAll('[id]')) e.removeAttribute('id');
  cur = t;
  return t;
}

// 새 화면을 그린 뒤: 연출 시작
function after(t, newEl) {
  if (!t || cur !== t) return;
  t.el = newEl;
  if (!t.themed) return generic(t);
  C.ui.classList.add('tr-hold');
  THEMES[t.theme](t);
}

// 진행 중인 전환을 즉시 끝낸다 (새 화면 전환 · 뒤로 가기 · 탭해서 건너뛰기)
function finish(skip) {
  const t = cur;
  if (!t) return;
  cur = null;
  t.done = true;
  for (const id of t.timers) clearTimeout(id);
  for (const a of t.anims) { try { a.cancel(); } catch { /* 무시 */ } }
  if (t.old) t.old.remove();
  C.ui.classList.remove('tr-hold', 'tr-wait');
  if (skip) { const el = C.ui.firstElementChild; if (el && el.classList.contains('screen')) el.classList.add('tr-now'); }
  if (t.ov) {
    // 건너뛰기 탭의 click 이 새 화면 버튼에 떨어지지 않게: 덮개는 투명하게 잠깐 더 남겨 click 을 받아 낸다
    if (skip) { const ov = t.ov; ov.className = 'tr-ov tr-eat'; ov.innerHTML = ''; const kill = () => ov.remove(); ov.addEventListener('click', kill, { once: true }); setTimeout(kill, 400); } else t.ov.remove();
  }
}
// 실제로 불러올 것이 있을 때만 기다린다 (가짜 대기 없음) · 덮인 상태에서 기다리고 · 0.25초 넘으면 로딩 카드
function hold(promise) {
  const t = cur;
  if (!t || !t.themed || !promise || typeof promise.then !== 'function') return;
  t.holds.push(promise.then(() => {}, () => {}));
}
// 출격: 화면을 지우는 대신 잠깐 흐려지며 사라지게 (beginPlay)
function leave() {
  finish();
  const el = C.ui.firstElementChild;
  for (const c of [...C.ui.children]) if (c !== el) c.remove();
  if (!el || reduced() || !el.classList.contains('screen')) { C.ui.innerHTML = ''; return; }
  el.classList.add('tr-old', 'tr-leave');
  el.inert = true;
  for (const e of el.querySelectorAll('[id]')) e.removeAttribute('id');
  setTimeout(() => el.remove(), ms(320));
}

// ─── 공통 도우미 ───
function later(t, d, fn) { t.timers.push(setTimeout(() => { if (!t.done) fn(); }, ms(d))); }
function anim(t, el, kf, o) {
  if (!el || !el.animate) return null;
  const a = el.animate(kf, Object.assign({ fill: 'both' }, o, { duration: ms(o.duration || 300), delay: ms(o.delay || 0) }));
  t.anims.push(a);
  return a;
}
function overlay(t, cls, html) {
  const ov = document.createElement('div');
  ov.className = 'tr-ov ' + cls;
  ov.innerHTML = html;
  ov.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); if (cur === t) finish(true); });
  C.stage.appendChild(ov);
  t.ov = ov;
  t.blocking = true;
  return ov;
}
// 덮은 뒤: 기다릴 것이 있으면 기다리고 → 드러내기
function whenCovered(t, reveal0) {
  t.blocking = true;
  if (t.old) { t.old.remove(); t.old = null; }
  // 덮인 동안 새 화면을 한 번 그려 둔다 (무거운 화면의 첫 그리기가 드러나는 움직임을 끊지 않게)
  C.ui.classList.remove('tr-hold'); C.ui.classList.add('tr-wait');
  const reveal = () => requestAnimationFrame(() => requestAnimationFrame(() => { if (!t.done) reveal0(); }));
  if (!t.holds.length) { reveal(); return; }
  let ready = false;
  const go = () => { if (ready || t.done) return; ready = true; if (t.card) t.card.classList.add('out'); reveal(); };
  Promise.all(t.holds).then(go);
  later(t, 250, () => { if (!ready) loadCard(t); });
  later(t, 4000, go); // 너무 오래 걸리면 화면부터 (화면 안에 불러오는 중 표시가 있다)
}
function loadCard(t) {
  if (!t.ov || t.card) return;
  const k = t.theme === 'towerIn' ? 'tower' : t.theme;
  const tips = C.tips || [];
  let i = (Math.random() * Math.max(1, tips.length)) | 0;
  const c = document.createElement('div');
  c.className = 'tr-card';
  c.innerHTML = `<i class="trc-art" style="background-image:url('${ART[k] || ART.shop}')"></i><b>${NAME[k] || ''}</b><small class="trc-tip">${tips.length ? esc(tips[i]) : ''}</small><span class="trc-dots"><i></i><i></i><i></i></span><em>불러오는 중 · 탭해서 넘기기</em>`;
  t.ov.appendChild(c);
  t.card = c;
  const tip = c.querySelector('.trc-tip');
  const rot = () => { if (t.done || !tips.length) return; i = (i + 1) % tips.length; tip.classList.remove('in'); void tip.offsetWidth; tip.textContent = tips[i]; tip.classList.add('in'); later(t, 2400, rot); };
  later(t, 2400, rot);
}
// 움직임이 실제로 끝난 뒤에 다음 단계로 (첫 프레임이 늦게 그려지는 느린 폰에서도 화면과 어긋나지 않게) · 멈춰도 1.5초 뒤엔 넘어간다
function then(t, a, fn) {
  let did = false;
  const go = () => { if (did || t.done) return; did = true; fn(); };
  if (a && a.finished) a.finished.then(go, () => {});
  later(t, a && a.finished ? 1500 : 0, go);
}
function end(t, d, a) { if (a) then(t, a, () => { if (cur === t) finish(false); }); else later(t, d, () => { if (cur === t) finish(false); }); }
function revealScreen(t, cls) {
  C.ui.classList.remove('tr-hold', 'tr-wait');
  t.blocking = false;
  if (t.ov) t.ov.classList.add('pass'); // 드러나는 동안은 새 화면을 바로 누를 수 있다
  const el = t.el && t.el.isConnected ? t.el : C.ui.firstElementChild;
  if (el && el.classList.contains('screen')) { t.el = el; el.classList.add('enter', 'tr-rv', cls); }
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ─── 그 밖: 깊이감 있는 밀기 ───
function generic(t) {
  const k = t.kind === 'go-back' ? 'back' : t.kind === 'go-tab' ? 'tab' : 'fwd';
  t.old.classList.add('tr-g', 'g-' + k);
  if (k === 'back') sfx('whooshBack'); else if (k === 'fwd') sfx('whoosh');
  t.old.addEventListener('animationend', (ev) => { if (ev.target === t.old && cur === t) finish(false); });
  end(t, 700); // 혹시 animationend 가 안 오면
}

const THEMES = {
  // 진상의 탑: 입구로 빨려 들어감
  towerIn(t) {
    const sr = t.sr, o = t.origin || { x: sr.width * 0.2, y: sr.height * 0.11 };
    const im = new Image(); im.src = ART.tower;
    if (!im.complete) hold(im.decode ? im.decode() : new Promise((r) => { im.onload = im.onerror = r; }));
    const emb = Array.from({ length: LOW ? 8 : 16 }, (_, i) => `<i style="left:${(i * 41 + 7) % 100}%"></i>`).join('');
    const ov = overlay(t, 'tr-tower', `<i class="trt-art" style="background-image:url('${ART.tower}');transform-origin:${o.x}px ${o.y}px"></i><i class="trt-fog"></i><i class="trt-vig"></i><div class="trt-emb">${emb}</div><b class="trt-name">진상의 탑</b>`);
    const origin = `${o.x}px ${o.y}px`;
    if (t.old) { t.old.style.transformOrigin = origin; anim(t, t.old, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.5) translate(1px, -1px)', opacity: 1, offset: 0.45 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 440, easing: 'cubic-bezier(.5,0,.9,.5)' }); }
    const art = ov.querySelector('.trt-art');
    const aArt = anim(t, art, [{ transform: 'scale(.18)', opacity: 0 }, { transform: 'scale(.55) translate(2px,1px)', opacity: 0.85, offset: 0.5 }, { transform: 'scale(.9) translate(-2px,-1px)', opacity: 1, offset: 0.8 }, { transform: 'scale(1)', opacity: 1 }], { duration: 440, easing: 'cubic-bezier(.55,0,.85,.6)' });
    anim(t, ov.querySelector('.trt-fog'), [{ transform: 'translateY(70%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 0.9, offset: 0.45 }, { transform: 'translateY(-75%)', opacity: 0 }], { duration: 820, easing: 'ease-out' });
    anim(t, ov.querySelector('.trt-vig'), [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 820 });
    anim(t, ov.querySelector('.trt-name'), [{ transform: 'translateY(30%) scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1, offset: 0.35 }, { transform: 'none', opacity: 1, offset: 0.75 }, { transform: 'translateY(-20%) scale(1.04)', opacity: 0 }], { duration: 760, delay: 160 });
    ov.querySelectorAll('.trt-emb i').forEach((e, i) => { const k = (0.6 + ((i * 7) % 9) / 10).toFixed(2); anim(t, e, [{ transform: `translateY(0) scale(${k})`, opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: `translate(${(i % 2 ? 1 : -1) * 18}px, -${55 + (i % 5) * 9}vh) scale(${k})`, opacity: 0 }], { duration: 640 + (i % 4) * 70, delay: (i % 6) * 40, easing: 'ease-out' }); });
    sfx('rumble'); sfx('whoosh'); buzz([18, 40, 30]);
    then(t, aArt, () => whenCovered(t, () => {
      revealScreen(t, 'tr-rv-tower');
      end(t, 0, anim(t, art, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.14)', opacity: 0 }], { duration: 420, easing: 'ease-out' }));
    }));
  },
  // 탑에서 로비로: 반대로 빠져나옴
  towerOut(t) {
    const ov = overlay(t, 'tr-tower out', '<i class="trt-fog"></i><i class="trt-vig"></i>');
    const aOld = t.old ? anim(t, t.old, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.62)', opacity: 0 }], { duration: 300, easing: 'cubic-bezier(.4,0,.8,.6)' }) : null;
    anim(t, ov.querySelector('.trt-fog'), [{ transform: 'translateY(-60%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 0.7, offset: 0.4 }, { transform: 'translateY(70%)', opacity: 0 }], { duration: 640, easing: 'ease-in-out' });
    const aVig = anim(t, ov.querySelector('.trt-vig'), [{ opacity: 0 }, { opacity: 0.9, offset: 0.45 }, { opacity: 0 }], { duration: 640 });
    sfx('whooshBack'); buzz(12);
    then(t, aOld, () => whenCovered(t, () => {
      const o = centerOf(t.el && (t.el.querySelector('.tw-entry') || t.el.querySelector('[data-act="lbModes"]')), t.sr);
      if (o && t.el) t.el.style.setProperty('--tr-o', `${o.x}px ${o.y}px`);
      revealScreen(t, 'tr-rv-out');
      end(t, 0, aVig);
    }));
  },
  // 레이드: 엘리베이터 문
  raid(t) {
    const ov = overlay(t, 'tr-elev', '<i class="tre-door l"><u></u></i><i class="tre-door r"><u></u></i><span class="tre-lamp"><b>레이드</b><i></i></span>');
    const L = ov.querySelector('.tre-door.l'), R = ov.querySelector('.tre-door.r'), lamp = ov.querySelector('.tre-lamp');
    const close = { duration: 300, easing: 'cubic-bezier(.6,0,.4,1.15)' };
    const aL = anim(t, L, [{ transform: 'translateX(-101%)' }, { transform: 'translateX(0)' }], close);
    anim(t, R, [{ transform: 'translateX(101%)' }, { transform: 'translateX(0)' }], close);
    sfx('whoosh');
    then(t, aL, () => {
      sfx('ding'); buzz(15); lamp.classList.add('on');
      whenCovered(t, () => later(t, 140, () => {
        revealScreen(t, 'tr-rv-pop');
        const open = { duration: 380, easing: 'cubic-bezier(.5,0,.3,1)' };
        const aO = anim(t, L, [{ transform: 'translateX(0)' }, { transform: 'translateX(-101%)' }], open);
        anim(t, R, [{ transform: 'translateX(0)' }, { transform: 'translateX(101%)' }], open);
        anim(t, lamp, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
        end(t, 0, aO);
      }));
    });
  },
  // 1:1 대전: 대각선 VS
  pvp(t) {
    const ov = overlay(t, 'tr-vs', '<i class="trv-h red"></i><i class="trv-h blue"></i><i class="trv-slash"></i><img class="trv-vs" src="/img/lb/tr_vs.webp" alt="" draggable="false">');
    const ang = (-Math.atan2(t.sr.height, t.sr.width) * 180 / Math.PI).toFixed(2) + 'deg';
    const red = ov.querySelector('.red'), blue = ov.querySelector('.blue'), slash = ov.querySelector('.trv-slash'), vs = ov.querySelector('.trv-vs');
    const dg = Math.ceil(Math.hypot(t.sr.width, t.sr.height));
    slash.style.width = dg + 'px'; slash.style.left = Math.round((t.sr.width - dg) / 2) + 'px';
    const inn = { duration: 320, easing: 'cubic-bezier(.7,0,.3,1)' };
    const aIn = anim(t, red, [{ transform: 'translate(-100%, -100%)' }, { transform: 'translate(0,0)' }], inn);
    anim(t, blue, [{ transform: 'translate(100%, 100%)' }, { transform: 'translate(0,0)' }], inn);
    sfx('whoosh');
    then(t, aIn, () => {
      sfx('crit'); buzz([10, 30, 20]);
      anim(t, slash, [{ transform: `rotate(${ang}) scaleX(0)`, opacity: 1 }, { transform: `rotate(${ang}) scaleX(1)`, opacity: 1, offset: 0.4 }, { transform: `rotate(${ang}) scaleX(1)`, opacity: 0 }], { duration: 420, easing: 'ease-out' });
      anim(t, vs, [{ transform: 'scale(2.2)', opacity: 0 }, { transform: 'scale(.92)', opacity: 1, offset: 0.55 }, { transform: 'scale(1)', opacity: 1 }], { duration: 220, easing: 'ease-out' });
      whenCovered(t, () => later(t, 160, () => {
        revealScreen(t, 'tr-rv-pop');
        const out = { duration: 340, easing: 'cubic-bezier(.6,0,.4,1)' };
        const aOut = anim(t, red, [{ transform: 'translate(0,0)' }, { transform: 'translate(-100%, 0)' }], out);
        anim(t, blue, [{ transform: 'translate(0,0)' }, { transform: 'translate(100%, 0)' }], out);
        anim(t, vs, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 240 });
        end(t, 0, aOut);
      }));
    });
  },
  // 상점 · 모집: 셔터 내림 → 말려 올라감 + 반짝
  shop(t) {
    const sp = Array.from({ length: LOW ? 6 : 10 }, (_, i) => `<img src="${ART.spark}" alt="" draggable="false" style="left:${8 + ((i * 37) % 84)}%;top:${12 + ((i * 53) % 70)}%">`).join('');
    const ov = overlay(t, 'tr-shut', `<div class="trs-panel"><i class="trs-slats"></i><span class="trs-sign"><b>${C.shopLabel ? esc(C.shopLabel()) : '상점'}</b><small>OPEN</small></span><i class="trs-bar"></i></div><div class="trs-sp">${sp}</div>`);
    const panel = ov.querySelector('.trs-panel');
    const aDn = anim(t, panel, [{ transform: 'translateY(-100%)' }, { transform: 'translateY(0)', offset: 0.8 }, { transform: 'translateY(-1.5%)', offset: 0.9 }, { transform: 'translateY(0)' }], { duration: 280, easing: 'cubic-bezier(.55,0,.9,.5)' });
    sfx('shutter');
    then(t, aDn, () => {
      buzz(12);
      whenCovered(t, () => later(t, 90, () => {
        revealScreen(t, 'tr-rv-pop');
        const aUp = anim(t, panel, [{ transform: 'translateY(0)' }, { transform: 'translateY(4%)', offset: 0.15 }, { transform: 'translateY(-102%)' }], { duration: 420, easing: 'cubic-bezier(.5,0,.6,1)' });
        sfx('reward');
        ov.querySelectorAll('.trs-sp img').forEach((e, i) => anim(t, e, [{ transform: 'scale(0) rotate(0deg)', opacity: 0 }, { transform: 'scale(1) rotate(60deg)', opacity: 1, offset: 0.45 }, { transform: 'scale(.2) rotate(120deg)', opacity: 0 }], { duration: 420, delay: 80 + (i % 5) * 50, easing: 'ease-out' }));
        then(t, aUp, () => end(t, 120));
      }));
    });
  },
};
