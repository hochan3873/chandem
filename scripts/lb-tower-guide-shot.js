'use strict';
// 진상의 탑 초보 가이드 화면 찍기 — node scripts/lb-tower-guide-shot.js <저장 폴더> [층]
//  손님 아닌 새 계정 · 탑 열림 · 멤버 여럿 · 튜토리얼 켬(?tut) → 로비 말풍선 → 연습 층 (끌기 · 빨간 원 피하기 · 체력 · 쓰러짐 · 기 모으기 끊기) → 결과
//  → 이 층 공략 카드 · 자세히 · 추천 파티 넣기 · 역할 가이드 · 도움말 (연출 줄이기 포함)
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
const F = Number(process.argv[3] || 32);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  await srv.accounts.ready;
  const { token, user } = await srv.accounts.signup({ username: `tg${Date.now() % 1e6}`, password: 'secret12', nickname: '가이드' });
  const st = (await srv.accounts.store.byId(user.id)).stats;
  const lb = st.langbang;
  lb.stages = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 3]));
  lb.maxStage = 12;
  const own = ['myunghoon', 'gunnyeo', 'wonsik', 'jiwon', 'staff', 'jungmin', 'hanna', 'soyoung', 'youngjun'];
  lb.owned = Object.assign({}, lb.owned, Object.fromEntries(own.map((h) => [h, true])));
  lb.heroes = Object.assign({}, lb.heroes, Object.fromEntries([...own, 'bangjang'].map((h) => [h, 8])));
  lb.hstars = Object.fromEntries(Object.keys(lb.heroes).map((h) => [h, 2]));
  lb.tower = Object.assign({}, lb.tower || {}, { best: F - 1 });
  await srv.accounts.store.saveStats(user.id, st);
  const browser = await puppeteer.launch({ executablePath: BROWSERS.find((p) => fs.existsSync(p)), headless: 'new', args: ['--mute-audio'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: false });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const base = `http://localhost:${port}/langbang/`;
  await page.goto(base + '?nogate&tut', { waitUntil: 'networkidle0' });
  await page.evaluate((t) => { localStorage.setItem('chandem:auth', JSON.stringify(t)); localStorage.setItem('langbang:towerSquad', JSON.stringify(['jiwon', 'hanna', 'youngjun'])); localStorage.setItem('langbang:pushAsked', '1'); localStorage.setItem('langbang:pushLater', String(Date.now() + 9e9)); localStorage.setItem('langbang:speed2', '0'); }, token);
  await page.goto(base + '?nogate&tut', { waitUntil: 'networkidle0' });
  await wait(2500);
  let n = 0;
  const shot = async (name) => { n++; const f = path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: f }); console.log('shot', path.basename(f)); };
  const bubble = () => page.evaluate(() => { for (const l of document.querySelectorAll('.tutor')) { if (l.classList.contains('tu-hid')) continue; const t = l.querySelector('.tu-txt'); if (t && t.textContent.trim()) return t.textContent; } return ''; });
  const waitBubble = async (re, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const b = await bubble(); if (re.test(b)) return b; await wait(150); } console.log('  (말풍선 못 찾음)', re, '| 지금:', await bubble()); return ''; };
  const next = () => page.evaluate(() => { for (const l of document.querySelectorAll('.tutor')) if (!l.classList.contains('tu-hid')) { const s = l.querySelector('.tu-say'); if (s) s.click(); } });
  const toScreen = (x, y) => page.evaluate((x, y) => { const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect(); const g = window.__lb.g; return { x: r.left + (x / g.W) * r.width, y: r.top + (y / g.H) * r.height }; }, x, y);
  const drag = async (from, to) => { await page.mouse.move(from.x, from.y); await page.mouse.down(); for (let k = 1; k <= 10; k++) { await page.mouse.move(from.x + ((to.x - from.x) * k) / 10, from.y + ((to.y - from.y) * k) / 10); await wait(30); } await page.mouse.up(); };

  // ── 1. 탑 로비 튜토리얼 ──
  await page.evaluate(() => window.__lb.tower());
  await waitBubble(/환영/); await wait(500); await shot('tut-lobby-hi'); await next();
  await waitBubble(/파티/); await wait(400); await shot('tut-lobby-party'); await next();
  const b3 = await waitBubble(/저항|이 층 공략/);
  if (/저항/.test(b3)) { await wait(400); await shot('tut-lobby-res'); await next(); await waitBubble(/이 층 공략/); }
  await wait(400); await shot('tut-lobby-guide'); await next();
  await waitBubble(/역할 가이드/); await wait(400); await shot('tut-lobby-roles'); await next();
  await waitBubble(/연습 층/); await wait(400); await shot('tut-lobby-practice');
  await page.evaluate(() => document.querySelector('[data-act="twPractice"]').click());

  // ── 2. 연습 층 ──
  await waitBubble(/연습 층이에요/, 15000); await wait(600); await shot('prac-hi'); await next();
  await waitBubble(/끌어/); await wait(500); await shot('prac-drag');
  const mv = await page.evaluate(async () => { const A = await import('/langbang/tower-arena.js'); const g = window.__lb.g; const h = A.members(g).find((o) => o.id === g.twPrac.mover) || A.members(g)[0]; return { x: h.x, y: h.y - 14 }; });
  await drag(await toScreen(mv.x, mv.y), await toScreen(Math.min(320, mv.x + 70), mv.y));
  await waitBubble(/빨간 원/); await wait(900); await shot('prac-tele');
  const tg = await page.evaluate(async () => { const A = await import('/langbang/tower-arena.js'); const g = window.__lb.g; const s = g.twa.tele[0]; const h = A.members(g).find((o) => o.id === s.tgt); const p = A.posOf(h); return { x: p.x, y: p.y - 14, sx: s.x, r: s.r }; });
  const p0 = await toScreen(tg.x, tg.y), dir = tg.sx > 180 ? -1 : 1;
  await page.mouse.move(p0.x, p0.y); await page.mouse.down();
  const p1 = await toScreen(tg.x + dir * (tg.r + 40), tg.y + 6);
  for (let k = 1; k <= 6; k++) { await page.mouse.move(p0.x + ((p1.x - p0.x) * k) / 10, p0.y + ((p1.y - p0.y) * k) / 10); await wait(30); }
  await shot('prac-tele-drag');
  for (let k = 7; k <= 10; k++) { await page.mouse.move(p0.x + ((p1.x - p0.x) * k) / 10, p0.y + ((p1.y - p0.y) * k) / 10); await wait(30); }
  await page.mouse.up();
  await waitBubble(/회피/); await wait(300); await shot('prac-dodged'); await next();
  await waitBubble(/초록 막대/); await wait(500); await shot('prac-hp'); await next();
  await waitBubble(/쓰러짐/); await wait(500); await shot('prac-down'); await next();
  await waitBubble(/기를 모아요/); await wait(700); await shot('prac-wind');
  const we = await page.evaluate(() => { const W = window.__lb.g.twa.wind; return W ? { x: W.e.x, y: W.e.y - W.e.def.size * 0.4 } : null; });
  if (we) { const q = await toScreen(we.x, we.y); await page.mouse.click(q.x, q.y); } // 한 번만 (말풍선 밖을 또 누르면 다음 말풍선으로 넘어간다)
  await waitBubble(/끊었다/, 25000); await wait(300); await shot('prac-cut'); await next();
  await waitBubble(/연습 끝/); await wait(300); await shot('prac-end'); await next();
  await wait(3500); await shot('prac-result');

  // ── 3. 이 층 공략 · 추천 파티 · 역할 가이드 · 도움말 ──
  await page.evaluate(() => window.__lb.tower()); await wait(1200);
  await page.evaluate(() => { const c = document.querySelector('.fc-guide'); if (c) c.scrollIntoView({ block: 'start' }); });
  await wait(400); await shot('guide-card');
  await page.evaluate(() => document.querySelector('[data-act="twGuide"]').click()); await wait(600); await shot('guide-pop');
  await page.evaluate(() => { const b = document.querySelector('.info-modal .pop-box'); if (b) b.scrollTop = 420; }); await wait(300); await shot('guide-pop-2');
  await page.evaluate(() => { const b = document.querySelector('.info-modal .pop-box'); if (b) b.scrollTop = 9999; }); await wait(300); await shot('guide-pop-3');
  await page.evaluate(() => document.querySelector('.info-modal [data-act="twRecAll"]').click()); await wait(900);
  await page.evaluate(() => { const c = document.querySelector('.tw-col'); if (c) c.scrollTop = 0; }); await wait(200); await shot('rec-applied');
  await page.evaluate(() => document.querySelector('[data-act="twRoles"]').click()); await wait(600); await shot('roles');
  await page.evaluate(() => { const b = document.querySelector('.info-modal .pop-box'); if (b) b.scrollTop = 520; }); await wait(300); await shot('roles-2');
  await page.evaluate(() => { document.body.classList.add('rm'); const b = document.querySelector('.info-modal .pop-box'); if (b) b.scrollTop = 9999; }); await wait(300); await shot('roles-3-rm');
  await page.evaluate(() => document.querySelector('.info-modal [data-x]').click()); await wait(300);
  await page.evaluate(() => document.querySelector('[data-act="twHelp"]').click()); await wait(600); await shot('help');
  const tutState = await page.evaluate(() => localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('langbang:twtut:'))));
  console.log('tower tut state:', tutState);
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
  await srv.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
