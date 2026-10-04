// 길 안내 (코치): 강화 · 우편 · 미션 같은 "할 일" 을 처음 하는 사람도 끝까지 따라가게
//  다음에 누를 곳만 밝게 (나머지는 어둡게 · 못 누름) + 빛나는 고리 + 손가락 + 한 줄 말풍선 → 누르면 다음 단계
//  · 누를 곳이 안 나타나면 (화면이 바뀌었거나 이미 끝남) 조용히 멈춘다 · ✕ 로 언제든 그만
//  · 단계 짜기(planFor)는 DOM 없이도 돌아간다 (테스트용)

// ─── 단계 짜기: 할 일 종류 → 누를 곳 목록 ───
//  t: { go: 'hero'|'star'|'gear'|'enh'|'mail'|'missions'|'checkin'|'chest'|'recruit', id, slot, gid, name, slotName }
//  s: 지금 화면 상태 { screen } — 이미 그 화면이면 앞 단계를 건너뛴다
export function planFor(t, s = {}) {
  if (!t || !t.go) return null;
  const nm = t.name || '멤버';
  const onMenu = () => s.screen === 'menu';
  const toLobby = { sel: '.lb-nav .nv[data-tab="battle"]', txt: '먼저 로비(전투)로 가요', skip: onMenu };
  if (t.go === 'hero' || t.go === 'star') {
    return { title: t.go === 'star' ? `${nm} ★승급` : `${nm} 강화`, steps: [
      { sel: '.lb-nav .nv[data-tab="deck"]', txt: '아래 <b>강화</b> 탭을 눌러요', skip: () => s.screen === 'deck' || s.hasSel('.hero-full') },
      // 위쪽 덱 칸(누르면 덱에서 빠짐)이 아니라 아래 모음 카드
      { sel: `.deck-screen .acard[data-act="deckColl"][data-id="${t.id}"]`, txt: `<b>${nm}</b> 카드를 눌러요`, skip: () => s.hasSel('.hero-full') },
      { sel: '.hero-full .hf-tabs [data-k="up"]', txt: '<b>강화</b> 탭을 눌러요', skip: () => s.hasSel('.hero-full .hs-up, .hero-full .hs-star') },
      t.go === 'star'
        ? { sel: '.hero-full .hs-star:not([disabled])', txt: '<b>승급</b> 버튼을 눌러요! 별이 하나 늘어요', last: true }
        : { sel: '.hero-full .hs-up:not([disabled])', txt: '<b>강화</b> 버튼을 눌러요! 꾹 누르면 계속 올라가요', last: true },
    ], done: t.go === 'star' ? ['★승급 완료!', `${nm} 공격력이 쑥 올랐어요`] : ['강화 완료!', `${nm} 전투력이 올랐어요`] };
  }
  if (t.go === 'gear' || t.go === 'enh') {
    const sn = t.slotName || (t.slot === 'w' ? '무기' : t.slot === 'a' ? '장신구' : '신화');
    return { title: t.go === 'enh' ? `${nm} ${sn} 강화` : `${nm} ${sn} 바꾸기`, steps: [
      { sel: '.lb-nav .nv[data-tab="bag"]', txt: '아래 <b>장비</b> 탭을 눌러요', skip: () => s.screen === 'bag' && s.hasSel('.eqv3') },
      { sel: `.eqv3 .eqh[data-id="${t.id}"]`, txt: `<b>${nm}</b> 얼굴을 눌러요`, skip: () => s.hasSel(`.eqv3 .eqh.on[data-id="${t.id}"]`) },
      { sel: `.eqv3 .eq-big[data-slot="${t.slot}"]`, txt: `<b>${sn}</b> 칸을 눌러요` },
      ...(t.go === 'enh'
        ? [{ sel: '.eq-sheet .eqs.cur', txt: '지금 낀 장비를 골라요', skip: () => s.hasSel('.eq-sheet .eqs.cur.sel') || !s.hasSel('.eq-sheet .eqs.cur') },
          { sel: '.eq-sheet [data-act="eqEnh"]:not([disabled])', txt: '<b>강화</b>(망치) 버튼을 눌러요!', last: true, wait: 1300 }]
        : [{ sel: `.eq-sheet .eqs[data-id="${t.gid}"]`, txt: '더 좋은 장비를 골라요', skip: () => !t.gid || s.hasSel(`.eq-sheet .eqs.sel[data-id="${t.gid}"]`), optional: true },
          { sel: '.eq-sheet [data-act="eqDo"]', txt: '<b>장착</b>을 눌러요!', last: true }]),
    ], done: t.go === 'enh' ? ['장비 강화!', '강화석 · 코인이 남으면 또 해 봐요'] : ['장착 완료!', `${nm} 전투력이 올랐어요`] };
  }
  if (t.go === 'mail') {
    return { title: '우편 받기', steps: [toLobby,
      { sel: '.lb-quick [data-act="mail"]', txt: '<b>우편</b>을 눌러요', skip: () => s.hasSel('.mail-pop') },
      { sel: ['.mail-pop [data-act="mailGet"][data-id="all"]', '.mail-pop [data-act="mailGet"]'], txt: '<b>받기</b>를 눌러요!', last: true },
    ], done: ['우편 받았어요!', '선물은 7일 안에 받아야 해요'] };
  }
  if (t.go === 'missions') {
    return { title: '미션 보상', steps: [toLobby,
      { sel: '.lb-quick [data-act="missionsNav"]', txt: '<b>미션</b>을 눌러요', skip: () => s.screen === 'missions' },
      { sel: ['.claim-tab:not([disabled])', '[data-act="claimMis"]:not([disabled])'], txt: '<b>모두 받기</b>를 눌러요!', last: true },
    ], done: ['보상 받았어요!', '미션은 매일 새로 생겨요'] };
  }
  if (t.go === 'checkin') {
    return { title: '출석 체크', steps: [toLobby,
      { sel: '.lb-side.r[data-act="lbMenu"]', txt: '<b>메뉴</b>를 눌러요', skip: () => s.hasSel('.mg-sheet, [data-act="doCheckin"]') },
      { sel: '.mg-sheet [data-act="checkin"]', txt: '<b>출석</b>을 눌러요', skip: () => s.hasSel('[data-act="doCheckin"]') },
      { sel: '[data-act="doCheckin"]:not([disabled])', txt: '<b>출석하기</b>를 눌러요!', last: true },
    ], done: ['출석 완료!', '내일도 오면 더 좋은 보상'] };
  }
  if (t.go === 'chest') {
    return { title: '별 상자', steps: [toLobby, { sel: '.lb-chests .chest.ready', txt: '반짝이는 <b>상자</b>를 눌러요!', last: true }], done: ['상자 열었어요!', '별을 모으면 상자가 또 열려요'] };
  }
  if (t.go === 'recruit') {
    return { title: '모집', steps: [
      { sel: '.lb-nav .nv[data-tab="shop"]', txt: '아래 <b>상점</b> 탭을 눌러요', skip: () => s.screen === 'shop' },
      { sel: '[data-act="shopTab"][data-tab="recruit"]', txt: '<b>모집</b>을 골라요', skip: () => s.hasSel('[data-act="shopTab"][data-tab="recruit"].on') },
      { sel: '[data-act="pull"][data-n="1"]:not([disabled])', txt: '모집권으로 <b>1회 모집</b>!', last: true, wait: 600 },
    ], done: ['새 멤버 카드!', '카드가 모이면 강화 · 승급에 써요'] };
  }
  return null;
}

// ─── 화면 위 코치 ───
//  o: { stage, toast(msg), onDone(more) }
export function createCoach(o) {
  const stage = o.stage;
  let cur = null; // { plan, i, el, layer, raf, timer }
  const vis = (el) => { if (!el || !el.isConnected || el.closest('.tr-old')) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  const find = (sel) => { for (const q of [].concat(sel)) { const el = [...document.querySelectorAll(q)].find(vis); if (el) return el; } return null; }; // 여러 개면 앞의 것부터 ("모두 받기" 먼저)
  function stop(quiet) {
    if (!cur) return;
    const c = cur; cur = null;
    cancelAnimationFrame(c.raf); clearTimeout(c.timer); clearTimeout(c.poll);
    document.removeEventListener('click', c.onClick, true);
    c.layer.classList.add('out'); setTimeout(() => c.layer.remove(), 220);
    if (!quiet && c.plan.onEnd) c.plan.onEnd(false);
  }
  function place() {
    if (!cur) return;
    const c = cur, L0 = c.layer, el = c.el;
    if (el && vis(el)) {
      const sr = stage.getBoundingClientRect(), k = sr.width / (stage.offsetWidth || sr.width) || 1, r = el.getBoundingClientRect();
      const pad = 5, x = (r.left - sr.left) / k - pad, y = (r.top - sr.top) / k - pad, w = r.width / k + pad * 2, h = r.height / k + pad * 2;
      const W = stage.offsetWidth, H = stage.offsetHeight;
      if (c.last !== `${x | 0},${y | 0},${w | 0},${h | 0}`) {
        c.last = `${x | 0},${y | 0},${w | 0},${h | 0}`;
        Object.assign(c.ring.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', borderRadius: Math.min(22, h / 2) + 'px' });
        // 둘레 네 칸은 못 누르게 (가운데 구멍만 누를 수 있음)
        const [t, b, l, rr] = c.blk;
        Object.assign(t.style, { left: 0, top: 0, width: W + 'px', height: Math.max(0, y) + 'px' });
        Object.assign(b.style, { left: 0, top: y + h + 'px', width: W + 'px', height: Math.max(0, H - y - h) + 'px' });
        Object.assign(l.style, { left: 0, top: y + 'px', width: Math.max(0, x) + 'px', height: h + 'px' });
        Object.assign(rr.style, { left: x + w + 'px', top: y + 'px', width: Math.max(0, W - x - w) + 'px', height: h + 'px' });
        // 손가락: 고리 아래 오른쪽 (화면 아래쪽이면 위에서) · 말풍선은 반대편
        const below = y + h / 2 < H * 0.55;
        Object.assign(c.hand.style, { left: Math.min(W - 40, x + w / 2 + 4) + 'px', top: (below ? y + h - 6 : y - 34) + 'px' });
        c.hand.classList.toggle('up', !below);
        const bw = c.bub.offsetWidth || 220, bh = c.bub.offsetHeight || 50;
        Object.assign(c.bub.style, { left: Math.max(8, Math.min(W - bw - 8, x + w / 2 - bw / 2)) + 'px', top: (below ? Math.min(H - bh - 8, y + h + 40) : Math.max(8, y - bh - 40)) + 'px' });
      }
    }
    c.raf = requestAnimationFrame(place);
  }
  function step(i) {
    if (!cur) return;
    const c = cur, st = c.plan.steps[i];
    c.i = i; c.el = null; c.last = '';
    if (!st) return finish();
    if (st.skip && (() => { try { return st.skip(); } catch { return false; } })()) { c.skipped++; return step(i + 1); }
    c.layer.classList.add('wait');
    const t0 = performance.now();
    const look = () => {
      if (!cur || cur !== c) return;
      const el = find(st.sel);
      if (!el) {
        if (performance.now() - t0 < (st.timeout || 3200)) { c.poll = setTimeout(look, 120); return; }
        if (st.optional) { c.skipped++; return step(i + 1); }
        o.toast && o.toast('안내할 곳이 안 보여서 멈췄어요 — 다시 눌러 주세요');
        return stop();
      }
      c.el = el;
      const sr = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
      if (r.top < sr.top + 40 || r.bottom > sr.bottom - 70) { try { el.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch { /* 무시 */ } } // 바로 옮긴다 (부드럽게 흘러가는 동안 누르면 빗나감)
      c.bub.innerHTML = `<em class="co-n">${st.last ? '마지막' : `${i + 1 - c.skipped}단계`}</em><span>${st.txt}</span>`; // 건너뛴 단계는 빼고 센다
      c.layer.classList.remove('wait');
      c.ring.classList.remove('pop'); void c.ring.offsetWidth; c.ring.classList.add('pop');
    };
    look();
  }
  function finish() {
    const c = cur; if (!c) return;
    cancelAnimationFrame(c.raf); clearTimeout(c.poll);
    document.removeEventListener('click', c.onClick, true);
    c.layer.classList.add('done');
    const more = c.plan.more ? c.plan.more() : null;
    const [h, sub] = c.plan.done || ['완료!', ''];
    c.layer.innerHTML = `<div class="co-dim"></div><div class="co-win"><i class="co-burst">${Array.from({ length: 12 }, (_, k) => `<i style="--a:${k * 30}deg;--d:${(k % 3) * 0.06}s"></i>`).join('')}</i><b>${h}</b><small>${sub}</small>
      <div class="co-btns">${more ? `<button class="co-more">${more.txt} ›</button>` : ''}<button class="co-home">${more ? '로비로' : '좋아요!'}</button></div></div>`;
    c.layer.addEventListener('click', (ev) => {
      const m = ev.target.closest('.co-more'), hm = ev.target.closest('.co-home');
      if (!m && !hm) return;
      ev.stopPropagation();
      cur = null; c.layer.classList.add('out'); setTimeout(() => c.layer.remove(), 220);
      if (c.plan.onEnd) c.plan.onEnd(true, m ? more : null);
    });
  }
  function start(plan) {
    stop(true);
    if (!plan || !plan.steps || !plan.steps.length) return false;
    const layer = document.createElement('div');
    layer.className = 'coach wait';
    layer.innerHTML = `<div class="co-ring"></div>${'<div class="co-blk"></div>'.repeat(4)}<i class="co-hand"></i><div class="co-bub"></div><button class="co-x" aria-label="안내 그만">✕ 그만</button><b class="co-title">${plan.title || '길 안내'}</b>`;
    stage.appendChild(layer);
    const c = { plan, i: 0, skipped: 0, el: null, layer, ring: layer.querySelector('.co-ring'), blk: [...layer.querySelectorAll('.co-blk')], hand: layer.querySelector('.co-hand'), bub: layer.querySelector('.co-bub'), raf: 0, timer: 0, poll: 0 };
    // 막힌 곳을 누르면: 말풍선이 살짝 흔들 (어디를 누를지 다시 알려 준다)
    for (const b of c.blk) b.addEventListener('click', (ev) => { ev.stopPropagation(); c.bub.classList.remove('nudge'); void c.bub.offsetWidth; c.bub.classList.add('nudge'); });
    layer.querySelector('.co-x').addEventListener('click', (ev) => { ev.stopPropagation(); stop(); });
    // 밝힌 곳을 누르면 → (앱이 그 동작을 끝낸 뒤) 다음 단계
    c.onClick = (ev) => {
      if (cur !== c || !c.el || !c.el.contains(ev.target)) return;
      const st = plan.steps[c.i];
      c.el = null; c.layer.classList.add('wait');
      c.timer = setTimeout(() => { if (cur === c) step(c.i + 1); }, st && st.last ? (st.wait || 900) : 280);
    };
    document.addEventListener('click', c.onClick, true);
    cur = c;
    c.raf = requestAnimationFrame(place);
    step(0);
    return true;
  }
  return { start, stop: () => stop(), active: () => !!cur };
}
