'use strict';
// 진상의 탑 (리메이크) 화면 찍기 — node scripts/lb-tower-shot.js <저장 폴더> [층]
//  계정: 1장 클리어 · 멤버 여럿 (+10 ★3) · 탑 최고 (층 − 1) → 로비 · 새 규칙 · 파티 고르기 → 전투: 예고 · 끌어서 피하기 · 기절 · 감전 번짐 · 체력 · 회복 · (51층~) 기 모으기
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
const F = Number(process.argv[3] || 32);
const SQUAD = (process.argv[4] || 'myunghoon,gunnyeo,wonsik').split(',');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  await srv.accounts.ready;
  const { token, user } = await srv.accounts.signup({ username: `tw${Date.now() % 1e6}`, password: 'secret12', nickname: '탑찍사' });
  const st = (await srv.accounts.store.byId(user.id)).stats;
  const lb = st.langbang;
  lb.stages = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 3]));
  lb.maxStage = 12;
  const own = ['wonsik', 'jungmin', 'myunghoon', 'sunggu', 'hanna', 'jeongseob', 'eunok', 'dragon', 'soyoung', 'hyungyeong', 'ara', 'jiwon'];
  lb.owned = Object.assign({}, lb.owned, Object.fromEntries(own.map((h) => [h, true])));
  lb.heroes = Object.assign({}, lb.heroes, Object.fromEntries([...own, 'bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon', 'ingyu', 'donghan', 'youngjun'].map((h) => [h, 10])));
  lb.hstars = Object.fromEntries(Object.keys(lb.heroes).map((h) => [h, 3]));
  lb.tower = Object.assign({}, lb.tower || {}, { best: F - 1, hb: { [SQUAD[0]]: F - 1 } });
  await srv.accounts.store.saveStats(user.id, st);
  const browser = await puppeteer.launch({ executablePath: BROWSERS.find((p) => fs.existsSync(p)), headless: 'new', args: ['--mute-audio'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: false });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /tower-arena/.test(m.text()))) errors.push(m.text()); });
  const base = `http://localhost:${port}/langbang/`;
  await page.goto(base + '?nogate', { waitUntil: 'networkidle0' });
  await page.evaluate((t, sq) => { localStorage.setItem('chandem:auth', JSON.stringify(t)); localStorage.setItem('langbang:towerSquad', JSON.stringify(sq)); }, token, SQUAD);
  await page.goto(base + '?nogate', { waitUntil: 'networkidle0' });
  await wait(2500);
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `tower-${name}.png`) }); console.log('shot', name); };
  await page.evaluate(() => window.__lb.tower());
  await wait(1200);
  await shot('rules'); // 첫 방문: 새 규칙 안내
  await page.evaluate(() => { const b = document.querySelector('[data-x]'); if (b) b.click(); });
  await wait(500);
  await shot('lobby');
  await page.evaluate(() => { const c = document.querySelector('.tw-col'); if (c) c.scrollTop = 140; });
  await wait(300);
  await shot('lobby-floor');
  await page.evaluate(() => { const b = document.querySelector('.tw-mem[data-s="2"]'); if (b) b.click(); });
  await wait(600);
  await shot('pick');
  await page.evaluate(() => { const b = document.querySelector('[data-x]') || document.querySelector('.popup .close'); if (b) b.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  await wait(400);
  await page.evaluate(() => window.__lb.tower());
  await wait(500);
  await page.evaluate(() => document.querySelector('[data-act="twGo"]').click());
  let ok = false;
  for (let k = 0; k < 60 && !ok; k++) { await wait(250); ok = await page.evaluate(() => { const g = window.__lb.g; return !!(g && g.twa && g.phase === 'wave'); }); }
  console.log('in fight:', ok);
  if (ok) {
    const clean = () => page.evaluate(() => { const g = window.__lb.g; if (g) { g.augOffer = null; g.pendingLevels = 0; g.god = true; g.twa.nextT = 99; g.twa.windT = 99; } for (const c of document.querySelectorAll('#cardstrip, .tip, .lb-tip, .toast')) c.hidden = true; });
    const TW = '/langbang/tower-arena.js';
    // 캔버스 좌표 → 화면 좌표
    const toScreen = (x, y) => page.evaluate((x, y) => { const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect(); return { x: r.left + (x / 360) * r.width, y: r.top + (y / window.__lb.g.H) * r.height }; }, x, y);
    await wait(3000); await clean(); await wait(400);
    await shot('fight');
    // 예고: 대장 발밑에 기절 원
    await page.evaluate(async (TW) => { const A = await import(TW); const g = window.__lb.g; const h = A.members(g)[0]; const s = A.spawnTele(g, 'stun', h); s.shape = 'circle'; s.r = 44; s.x = h.x; s.y = h.y; s.warn = 3.2; const s2 = A.spawnTele(g, 'stun', A.members(g)[2]); s2.shape = 'line'; s2.w = 24; s2.x = A.members(g)[2].x; s2.warn = 3.4; }, TW);
    await wait(1100); await clean();
    await shot('telegraph');
    // 끌어서 피하기: 대장을 오른쪽으로 끌기 (화살표가 보이는 순간 · 걸어가는 중)
    const h0 = await page.evaluate(async (TW) => { const A = await import(TW); const g = window.__lb.g; const h = A.members(g)[0]; return { x: h.x, y: h.y - 12 }; }, TW);
    const p0 = await toScreen(h0.x, h0.y), p1 = await toScreen(Math.min(330, h0.x + 110), h0.y + 10);
    await page.mouse.move(p0.x, p0.y); await page.mouse.down();
    for (let k = 1; k <= 8; k++) { await page.mouse.move(p0.x + ((p1.x - p0.x) * k) / 8, p0.y + ((p1.y - p0.y) * k) / 8); await wait(30); }
    await shot('drag');
    await page.mouse.up();
    await wait(500);
    await shot('dodge-walk');
    await wait(1300); await clean();
    await shot('dodge');
    // 기절: 둘째 멤버에게 바로 터지는 기절
    await page.evaluate(async (TW) => { const A = await import(TW); const g = window.__lb.g; const h = A.members(g)[1]; const s = A.spawnTele(g, 'stun', h); s.warn = 0.5; }, TW);
    await wait(900); await clean();
    await shot('stunned');
    // 감전 번짐: 셋을 모아 놓고 한 명에게 감전
    await page.evaluate(async (TW) => { const A = await import(TW); const g = window.__lb.g; const ms = A.members(g); ms.forEach((h, i) => { h.stunT = 0; h.twTo = null; h.x = 150 + i * 46; h.y = g.rowY - 20 + (i % 2) * 14; h.px = h.x; h.py = h.y; h.rx = h.x; }); const s = A.spawnTele(g, 'shock', ms[1]); s.shape = 'circle'; s.r = 40; s.warn = 0.35; }, TW);
    await wait(520);
    await shot('shock');
    await wait(500); await clean();
    await shot('shock-after');
    // 체력 · 회복: 체력을 깎아 두고 건전녀 응급 방패
    await page.evaluate(async (TW) => { const A = await import(TW); const g = window.__lb.g; for (const h of A.members(g)) { h.stunT = 0; h.twShockT = 0; h.twHp = h.twMax * (0.25 + Math.random() * 0.4); h.twHitT = g.t; } const gn = A.members(g).find((h) => h.id === 'gunnyeo'); if (gn) { gn.skillCd = 0; g.mom = 9; } }, TW);
    await wait(700); await clean();
    await shot('hp');
    await page.evaluate(async () => { const S = await import('/langbang/sim.js'); const g = window.__lb.g; const gn = g.heroes.find((h) => h.id === 'gunnyeo'); if (gn) { gn.skillCd = 0; gn.stunT = 0; g.mom = 1e3; S.castSkill(g, gn); } });
    await wait(450);
    await shot('heal');
    // 쓰러짐 (한 명)
    await page.evaluate(async (TW) => { const A = await import(TW); const g = window.__lb.g; const h = A.members(g)[2]; h.twHp = 1; const s = A.spawnTele(g, 'hit', h); s.shape = 'circle'; s.r = 44; s.x = h.x; s.y = h.y; s.warn = 0.3; }, TW);
    await wait(1400); await clean();
    await shot('down');
    // 기 모으기 (51층 이상만)
    const wind = await page.evaluate(async (TW) => { const A = await import(TW); const g = window.__lb.g; if (!g.twa.plan.wind) return false; g.twa.windT = 0; return true; }, TW);
    if (wind) { await wait(1200); await clean(); await shot('wind'); }
    // 다른 위험 모양들 (원 · 세로 줄 · 가로 띠 · 부채꼴 · 십자 · 고리)
    await page.evaluate(async (TW) => { const A = await import(TW); const g = window.__lb.g; const ms = A.members(g); ms.forEach((h, i) => { h.twDown = 0; h.stunT = 0; h.x = 70 + i * 110; h.y = g.rowY - 30; h.px = h.x; h.py = h.y; }); const k = ['freeze', 'charm', 'silence']; ms.forEach((h, i) => { const s = A.spawnTele(g, k[i], h); s.warn = 4; }); const s2 = A.spawnTele(g, 'poison', ms[0]); s2.warn = 4; }, TW);
    await wait(1500); await clean();
    await shot('shapes');
  }
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
  await srv.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
