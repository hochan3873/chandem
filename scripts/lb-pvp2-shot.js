'use strict';
// 1:1 맞대결 v2 — 두 화면(손님 두 명)으로 친구 방 대전을 실제로 돌려 보고 화면을 찍는다
//  node scripts/lb-pvp2-shot.js <저장 폴더> [초]
//  · 두 사람 모두 자동으로 누른다 (스킬 · 조준 · 교체 · 정신 차려 · 보내기 · 총력전) · 마지막에 한쪽 입구를 무너뜨려 결과 화면까지
//  · 프레임 묶음(frames-a.png · frames-b.png): 1.5초마다 찍은 화면을 한 장에
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
const SEC = Number(process.argv[3] || 36);
const DA = ['gunman', 'staff', 'sunggu', 'gunnyeo', 'jieun', 'ingyu'];
const DB = ['bangjang', 'subin', 'hanna', 'donghan', 'soyoung', 'wonsik'];
const prof = (deck, slots = 6) => ({ items: slots >= 6 ? { slot5: 1, slot6: 1 } : {}, stages: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i + 1, 3])), heroes: Object.fromEntries(deck.map((id) => [id, 6])), owned: Object.fromEntries(deck.map((id) => [id, 1])), deckSlots: 6, tutDone: true });
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = createServer({ port: 0, lbpvp2: { botAfterMs: 120000, countdownMs: 2500 } });
  const port = await srv.listen();
  const base = `http://localhost:${port}/langbang/`;
  const browser = await puppeteer.launch({ executablePath: BROWSERS.find((p) => fs.existsSync(p)), headless: 'new', args: ['--mute-audio'] });
  const ctxB = await browser.createBrowserContext(); // 두 번째 사람: 저장소가 따로 (손님 id 가 달라야 서로 매칭된다)
  const errors = [];
  async function open(ctx, deck, tag, slots) {
    const page = await ctx.newPage();
    await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.on('pageerror', (e) => errors.push(tag + ': ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text())) errors.push(tag + ' console: ' + m.text()); });
    await page.goto(base + '?nogate', { waitUntil: 'networkidle0' });
    await page.evaluate((p, deck) => {
      localStorage.setItem('langbang:guest', JSON.stringify(p));
      const slots = [deck[0], deck[1], deck[2], deck[3], deck[4], deck[5]];
      localStorage.setItem('langbang:decks', JSON.stringify({ decks: [slots, slots.slice(), slots.slice()], i: 0 }));
      localStorage.setItem('langbang:patchSeen', 'zzzz');
      localStorage.setItem('langbang:acqSeen', JSON.stringify(['dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun', 'eunok', 'hanna', 'sunggu', 'dragon', 'junseo', 'hyungyeong', 'ara', 'soyoung', 'jieun', 'sanghwa', 'jungmin', 'jiwon', 'wonsik', 'jeongseob', 'baul', 'subin', 'hochan', 'byunghwa'])); // 스토리 합류 연출 건너뛰기
    }, prof(deck, slots), deck);
    await page.goto(base + '?nogate', { waitUntil: 'networkidle0' });
    await wait(1200);
    await page.evaluate(() => { for (const x of document.querySelectorAll('.info-modal')) x.remove(); const n = document.querySelector('[data-act="nav"][data-tab="pvp"]'); if (n) n.click(); });
    await wait(900);
    return page;
  }
  const A = await open(browser.defaultBrowserContext(), DA, 'A');
  const B = await open(ctxB, DB, 'B', 4); // B 는 덱 칸 4개만 산 사람 → 대전에서 벤치 2명을 자동으로 채운다
  await A.screenshot({ path: path.join(OUT, '00-lobby.png') });
  // A: 방 만들기 → 코드
  await A.evaluate(() => document.querySelector('[data-act="pvpRoom"]').click());
  await wait(500);
  await A.evaluate(() => { const b = document.querySelector('.input-pop [data-ib="ok"]'); if (b) b.click(); });
  let code = null;
  for (let k = 0; k < 40 && !code; k++) { await wait(150); code = await A.evaluate(() => { const c = document.querySelector('.pv2-wait .pvp-code'); return c ? c.textContent.trim() : null; }); }
  console.log('room code:', code);
  await A.screenshot({ path: path.join(OUT, '01-wait.png') });
  await B.evaluate((c) => window.__lb.pv2().enter(c), code);
  await wait(1200);
  await B.screenshot({ path: path.join(OUT, '02-vs.png') });
  for (const p of [A, B]) for (let k = 0; k < 60; k++) { if (await p.evaluate(() => !!document.querySelector('.pv2') && !!window.__lb.pv2().debug.last)) break; await wait(150); }
  // 자동으로 누르기 (사람처럼): 준비된 스킬 · 정신 차려 · 보내기 · 총력전 · 가끔 교체 · 상대 멤버 조준
  const play = (p, seed) => p.evaluate((seed) => {
    const st = window.__lb.pv2().debug, x = st.last; if (!x) return '';
    const el = document.querySelector('.pv2'); if (!el) return '';
    const r = Math.abs(Math.sin(seed * 12.9898 + x.t)) % 1;
    const click = (q) => { const b = el.querySelector(q); if (b) { b.click(); return true; } return false; };
    if (click('.pv2-b.cl.hot')) return 'cleanse';
    if (x.me.u >= 100 && x.me.m >= 200 && r < 0.6 && click('.pv2-b.ult.ready')) return 'ult';
    const rb = el.querySelector('.pv2-s.ready');
    if (rb && r < 0.5 && x.meE.length) { // 끌어서 조준: 버튼 → 내 판 진상 위
      const e = x.meE[0], cv = el.querySelector('.pv2-cv').getBoundingClientRect(), q = st.toScr('me', e.x, e.y), L = st.lay, br = rb.getBoundingClientRect();
      const o = { bubbles: true, pointerId: 7, isPrimary: true };
      rb.dispatchEvent(new PointerEvent('pointerdown', { ...o, clientX: br.left + 10, clientY: br.top + 10 }));
      rb.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: q[0] * L.k + cv.left, clientY: q[1] * L.k + cv.top }));
      window.__dragShot = true;
      setTimeout(() => rb.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: q[0] * L.k + cv.left, clientY: q[1] * L.k + cv.top })), 350);
      return 'drag';
    }
    if (rb) { const br = rb.getBoundingClientRect(), o = { bubbles: true, pointerId: 8, isPrimary: true, clientX: br.left + 10, clientY: br.top + 10 }; rb.dispatchEvent(new PointerEvent('pointerdown', o)); rb.dispatchEvent(new PointerEvent('pointerup', o)); return 'skill'; }
    if (r < 0.25 && click('.pv2-b.send.ready')) return 'send';
    if (r > 0.92 && x.me.sw <= 0 && x.me.bench.length) { click('.pv2-bn'); setTimeout(() => { const s = el.querySelectorAll('.pv2-s'); if (s.length) s[(Math.random() * s.length) | 0].click(); }, 120); return 'swap'; }
    if (r > 0.95 && x.op.h.length) { const cv = el.querySelector('.pv2-cv'), rc = cv.getBoundingClientRect(), L = st.lay, h = x.op.h[(r * 97 | 0) % x.op.h.length]; const q = st.toScr('op', h[6], h[7] - 20); const sx = q[0] * L.k + rc.left, sy = q[1] * L.k + rc.top; cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: sx, clientY: sy, bubbles: true })); return 'target'; }
    return '';
  }, seed);
  const frames = { A: [], B: [] };
  const t0 = Date.now(); let n = 0;
  const acts = {};
  while (Date.now() - t0 < SEC * 1000) {
    for (const [p, s] of [[A, 1], [B, 2]]) { const a = await play(p, s + n); if (a) acts[a] = (acts[a] || 0) + 1; }
    n++;
    if (acts.drag && !frames.drag) { frames.drag = 1; await wait(150); await A.screenshot({ path: path.join(OUT, '05-drag-aim-a.png') }); await B.screenshot({ path: path.join(OUT, '05-drag-aim-b.png') }); }
    if (n % 6 === 0) {
      for (const [p, tag] of [[A, 'A'], [B, 'B']]) { const f = path.join(OUT, `f${tag}-${String(frames[tag].length).padStart(2, '0')}.png`); await p.screenshot({ path: f }); frames[tag].push(f); }
    }
    await wait(250);
  }
  console.log('acts:', acts);
  const kb = srv.lbPvp2.matches.size ? [...srv.lbPvp2.matches.values()][0].p.map((p) => Math.round((p.net || 0) / 1024)) : [];
  console.log('보낸 양(KB, 두 사람):', kb, '· 초당 약', kb.map((k) => Math.round((k * 1024) / Math.max(1, SEC - 3))), 'B/s');
  const fps = await A.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
  const stat = await A.evaluate(() => { const x = window.__lb.pv2().debug.last; return { t: x.t, meHp: x.me.hp, opHp: x.op.hp, meE: x.meE.length, ne: x.me.ne, kills: [x.me.k, x.op.k], h: x.me.h.map((h) => h[1] + ':' + h[2]) }; });
  console.log('fps(headless):', fps, 'state:', stat);
  // 결과: B 입구를 무너뜨려 끝내기
  const m = [...srv.lbPvp2.matches.values()][0];
  if (m) { const bi = m.p.findIndex((p) => p.deck.includes('bangjang')); m.d.sides[bi].g.base.hp = 0; }
  await wait(1200);
  await A.screenshot({ path: path.join(OUT, '90-result-win.png') });
  await B.screenshot({ path: path.join(OUT, '91-result-lose.png') });
  // 프레임 묶음 (4칸 × n줄)
  const sheet = await browser.newPage();
  for (const tag of ['A', 'B']) {
    const imgs = frames[tag].map((f) => `<img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}">`).join('');
    const rows = Math.ceil(frames[tag].length / 4);
    await sheet.setViewport({ width: 4 * 362, height: Math.max(1, rows) * 642, deviceScaleFactor: 1 });
    await sheet.setContent(`<style>body{margin:0;background:#000;display:grid;grid-template-columns:repeat(4,360px);gap:2px}img{width:360px;height:640px}</style>${imgs}`);
    await sheet.screenshot({ path: path.join(OUT, `frames-${tag.toLowerCase()}.png`), fullPage: true });
  }
  console.log('errors:', errors.length ? errors.slice(0, 10) : 'none');
  await browser.close(); await srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
