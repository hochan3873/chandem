// 랑방 대전 — 재화 화면: 재화 안내 창(얻는 곳 · 쓰는 곳) · 성장 길잡이 · 얻을 때 날아가는 아이콘
//  규칙 · 숫자는 전부 currency.js. 여기는 그리기와 연결만. (화면 도구는 game.js 가 initCurrency 로 넘긴다)
import * as C from './currency.js';

let D = null; // game.js 가 넘긴 도구
const reduced = () => document.body.classList.contains('rm');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ─── 날아가는 아이콘 ───
//  currencyFly(id, fromRect, n): fromRect(DOMRect 또는 {left, top, width, height}) 에서 위 칩 (data-cur="id") 으로 같은 아이콘이 날아가고 숫자가 올라간다.
//  칩이 없는 화면이면 오른쪽 위에 작은 칩이 잠깐 떴다 사라진다 · body.rm 이면 날지 않고 칩만 톡 (+n 글자)
let tapAt = { x: 180, y: 320, t: 0 };
const trayEls = {};
function chipFor(id) {
  const all = document.querySelectorAll(`[data-cur="${id}"]`);
  for (const el of all) { const r = el.getBoundingClientRect(); if (r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight) return el; }
  return null;
}
function numEl(chip) { // 숫자만 든 칸 (체력처럼 안에 작은 글씨가 섞인 칸은 건드리지 않는다)
  const cand = chip.matches('b, span, em') && !chip.children.length ? chip : [...chip.querySelectorAll('b')].find((b) => !b.children.length && /^[\d,∞]+$/.test(b.textContent.trim()));
  return cand && /^[\d,]+$/.test(cand.textContent.trim()) ? cand : null;
}
function trayFor(id, now) {
  let t = trayEls[id];
  if (t && t.isConnected) return t;
  t = document.createElement('div'); t.className = 'cur-tray'; t.style.cssText = C.curVars(id);
  t.innerHTML = `${C.curIcon(id, 'md')}<b>${C.fmtN(now)}</b>`; t.dataset.curtray = id;
  const n = Object.keys(trayEls).filter((k) => trayEls[k] && trayEls[k].isConnected).length; t.style.top = `calc(env(safe-area-inset-top, 0px) + ${10 + n * 36}px)`;
  document.body.appendChild(t); trayEls[id] = t;
  return t;
}
function tick(el, from, to, ms = 520) {
  if (!el) return;
  if (reduced() || from === to) { el.textContent = C.fmtN(to); return; }
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = C.fmtN(Math.round(from + (to - from) * e)); if (k < 1 && el.isConnected) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function pop(el, id, n) {
  if (!el) return;
  el.classList.remove('cur-pop'); void el.offsetWidth; el.classList.add('cur-pop');
  const r = el.getBoundingClientRect(), tag = document.createElement('i');
  tag.className = 'cur-plus'; tag.textContent = `+${C.fmtN(n)}`; tag.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top}px;${C.curVars(id)}`;
  document.body.appendChild(tag); setTimeout(() => tag.remove(), reduced() ? 1100 : 900);
  setTimeout(() => el.classList.remove('cur-pop'), 500);
}
export function currencyFly(id, fromRect, n = 1) {
  if (!C.CUR[id] || !(n > 0) || !document.body) return;
  const cur = D ? C.amount(D.P(), id) : 0;
  const fr = fromRect && fromRect.getBoundingClientRect ? fromRect.getBoundingClientRect() : fromRect;
  const sx = fr ? fr.left + (fr.width || 0) / 2 : innerWidth / 2, sy = fr ? fr.top + (fr.height || 0) / 2 : innerHeight * 0.55;
  setTimeout(() => { // 화면이 새로 그려진 다음에 칩을 찾는다
    let chip = chipFor(id), tray = null;
    if (!chip) { tray = trayFor(id, cur); chip = tray; }
    const num = tray ? tray.querySelector('b') : numEl(chip), shown = cur - n;
    if (num && id !== 'sta') num.textContent = C.fmtN(Math.max(0, shown)); // 날아오는 동안은 예전 숫자
    const hide = () => { if (tray) { clearTimeout(tray._t); tray._t = setTimeout(() => { tray.classList.add('out'); setTimeout(() => { tray.remove(); }, 400); }, 1400); } };
    if (reduced()) { pop(chip, id, n); if (num && id !== 'sta') num.textContent = C.fmtN(cur); hide(); return; }
    const k = Math.min(7, Math.max(2, Math.ceil(Math.log2(n + 1)))), tr = chip.getBoundingClientRect(), tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
    let landed = 0;
    for (let i = 0; i < k; i++) {
      const f = document.createElement('div'); f.className = 'cur-fly'; f.style.cssText = `left:${sx}px;top:${sy}px;${C.curVars(id)}`; f.innerHTML = C.curIcon(id, 'md');
      document.body.appendChild(f);
      const ang = (i / k) * Math.PI * 2 + Math.random(), r0 = 26 + Math.random() * 26, bx = Math.cos(ang) * r0, by = Math.sin(ang) * r0 - 14;
      const dx = tx - sx, dy = ty - sy, dur = 640 + i * 40;
      const a = f.animate([
        { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
        { transform: `translate(calc(-50% + ${bx}px), calc(-50% + ${by}px)) scale(1.15)`, opacity: 1, offset: 0.22 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)`, opacity: 1, offset: 0.92 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.4)`, opacity: 0 },
      ], { duration: dur, delay: i * 55, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'both' });
      a.onfinish = () => {
        f.remove(); landed++;
        if (landed === 1) pop(chip, id, n);
        if (landed === k) { const live = tray ? tray.querySelector('b') : chipFor(id) && numEl(chipFor(id)); if (live && id !== 'sta') tick(live, Math.max(0, shown), cur); hide(); }
      };
    }
  }, 60);
}
// 판 · 우편 · 미션 · 상점에서 늘어난 재화마다 날린다 (before = C.snap(예전 프로필))
export function flyGains(before, fromEl) {
  if (!D) return;
  const g = C.gainsOf(before, C.snap(D.P())); const ids = Object.keys(g);
  if (!ids.length) return;
  let r = fromEl && fromEl.isConnected && fromEl.getBoundingClientRect ? fromEl.getBoundingClientRect() : null;
  if (!r || r.width === 0) { const fresh = performance.now() - tapAt.t < 5000; r = fresh ? { left: tapAt.x, top: tapAt.y, width: 0, height: 0 } : null; }
  // 보상 연출(.rv-ov)이 떠 있으면 거기서 닫을 때 날리니 여기선 건너뛴다 (두 번 날지 않게)
  ids.forEach((id, i) => { if (id !== 'sig') setTimeout(() => { if (!document.querySelector('.rv-ov')) currencyFly(id, r, g[id]); }, 80 + i * 220); });
}
export { snapNow };
function snapNow() { return D ? C.snap(D.P()) : {}; }

// ─── 재화 안내 창 (아래에서 올라오는 창) ───
const goBtn = (row, p) => {
  const lock = C.lockedNow(p, row), none = row.go === 'none' || !row.go;
  if (none) return '';
  return `<button class="cs-go ${lock ? 'lock' : ''}" data-act="curGo" data-go="${row.go}" ${lock ? `data-lock="${esc(C.lockText(row))}"` : ''}>${lock ? '🔒' : ''}${esc(C.GO[row.go] || '바로 가기')} <i>▸</i></button>`;
};
export function sheetHtml(id, p) {
  const c = C.CUR[id], v = id === 'coins' && p.unlimited ? '∞' : C.fmtN(C.amount(p, id));
  const caps = C.caps(id, p).map((x) => `<li class="${x.full ? 'full' : ''}">${esc(x.t)}</li>`).join('');
  const list = (rows) => rows.map((r) => `<div class="cs-row ${C.lockedNow(p, r) ? 'lock' : ''}"><span>${esc(r.t())}${C.lockedNow(p, r) ? `<small>${esc(C.lockText(r))}</small>` : ''}</span>${goBtn(r, p)}</div>`).join('');
  return `<div class="cs-head" style="${C.curVars(id)}"><span class="cs-ic">${C.curIcon(id, 'xl')}</span><div class="cs-t"><b>${c.name}${c.alias ? `<small>${c.alias}</small>` : ''}</b><em>${esc(c.short)}</em></div><div class="cs-amt"><small>지금</small><b>${v}</b></div></div>
    ${caps ? `<ul class="cs-caps">${caps}</ul>` : ''}
    <h4 class="cs-h get">얻는 곳</h4><div class="cs-list">${list(C.SOURCES[id])}</div>
    <h4 class="cs-h use">쓰는 곳</h4><div class="cs-list">${list(C.SINKS[id])}</div>
    <div class="cs-foot"><button class="btn mini" data-act="growth">${D.ic('hammer', '', 'sm')} 성장 길잡이 — 지금 뭘 하면 좋을까?</button></div>`;
}
export function showCurrency(id) {
  if (!C.CUR[id]) return;
  D.popup(sheetHtml(id, D.P()), 'lb-sheet cur-sheet');
}

// ─── 성장 길잡이 ───
export function envNow() {
  const p = D.P();
  return { owned: D.owned(), deck: (() => { const d = [...new Set((D.curDeck() || []).filter(Boolean))]; return d.length ? d : D.owned().slice(0, 4); })(), power: (pp, id) => D.heroPower(pp, id), metaMax: D.metaMaxOf, costOf: (pp, id) => D.costOf(pp, id), uid: D.uid(), gearUp: D.upgradeList().filter((u) => u.go === 'gear' || u.go === 'enh'), p };
}
let lastPlan = null;
export function growthHtml() {
  const p = D.P(), g = C.growth(p, envNow()); lastPlan = g;
  const m = g.main;
  const act = (o, i, kind) => (o.todo ? `data-act="growthDo" data-i="${i}" data-kind="${kind}"` : `data-act="curGo" data-go="${o.go}"`);
  const mainCard = `<div class="gr-main" style="${C.curVars(m.cur)}"><span class="gm-ic">${C.curIcon(m.cur, 'xl')}</span>
      <p class="gm-line">${esc(m.line)}</p><small class="gm-sub">${esc(m.sub || '')}</small>
      <button class="btn primary gm-btn" ${m.todo ? 'data-act="growthDo" data-i="main" data-kind="main"' : `data-act="curGo" data-go="${m.go}"`}>${esc(m.btn)} <i>▸</i></button></div>`;
  const warns = g.warns.map((w, i) => `<div class="gr-warn" style="${C.curVars(w.cur)}">${C.curIcon(w.cur)}<span>${esc(w.txt)}</span><button class="cs-go" data-act="curGo" data-go="${w.go}">${esc(w.btn)}</button></div>`).join('');
  const saves = g.saves.map((s) => `<div class="gr-save" style="${C.curVars(s.cur)}"><b>모아 두세요</b><span>${esc(s.txt)}</span></div>`).join('');
  const rows = g.list.map((r, i) => `<div class="gr-row" style="${C.curVars(r.cur)}"><i class="gr-n">${i + 1}</i>${C.curIcon(r.cur)}<span><b>${esc(r.txt)}</b><small>${esc(r.sub || '')}</small></span><button class="cs-go" ${act(r, i, 'list')}>${esc(r.btn)}</button></div>`).join('');
  const chips = C.CUR_IDS.map((id) => `<button class="gr-chip" data-act="curInfo" data-cur="${id}" style="${C.curVars(id)}">${C.curIcon(id)}<b>${id === 'coins' && p.unlimited ? '∞' : C.fmtN(C.amount(p, id))}</b></button>`).join('');
  return `<h3>${D.ic('hammer', '', 'sm')}성장 길잡이</h3>${mainCard}
    ${warns ? `<h4 class="cs-h warn">놓치면 아까워요</h4>${warns}` : ''}${saves}
    ${rows ? `<h4 class="cs-h use">재화별로 이렇게 써요</h4><div class="gr-list">${rows}</div>` : ''}
    <h4 class="cs-h get">내 재화 <small>눌러서 얻는 곳 · 쓰는 곳 보기</small></h4><div class="gr-chips">${chips}</div>`;
}
export function showGrowth() { D.popup(growthHtml(), 'lb-sheet cur-sheet gr-sheet'); }

export function initCurrency(deps) {
  D = deps;
  // 마지막으로 누른 자리 (눌렀던 버튼이 새로 그려져서 없어져도 거기서 날아가게)
  document.addEventListener('pointerdown', (ev) => { tapAt = { x: ev.clientX, y: ev.clientY, t: performance.now() }; }, { capture: true, passive: true });
  return {
    curInfo: (b) => showCurrency(b.dataset.cur),
    growth: () => showGrowth(),
    curGo: (b) => { if (b.dataset.lock) { D.toast(b.dataset.lock, 2200); return; } D.go(b.dataset.go); },
    growthDo: (b) => {
      const g = lastPlan || C.growth(D.P(), envNow()); const t = b.dataset.i === 'main' ? g.main.todo : (g.list[Number(b.dataset.i)] || {}).todo;
      if (t) { D.closeInfoCard(); D.guideTodo(t); }
    },
  };
}
