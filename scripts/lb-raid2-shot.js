'use strict';
// 건물주 레이드 화면 찍기 (로비 · 전투 · 결과) — node scripts/lb-raid2-shot.js <저장 폴더> [시작 페이즈 1|2|3]
//  서버를 잠깐 띄우고 계정 하나를 만들어 레이드 로비 → 도전 → 전투 몇 장면 (예고 · 붙잡기 · 고지서) → 입구가 부서진 결과
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
const PH = Number(process.argv[3] || 1);
(async () => {
  const R2 = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'raid2.js')).href);
  const L = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'live.js')).href);
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  await srv.accounts.ready;
  const { token, user } = await srv.accounts.signup({ username: `shot${Date.now() % 1e6}`, password: 'secret12', nickname: '찍사' });
  const st = (await srv.accounts.store.byId(user.id)).stats;
  st.langbang.stages = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 3]));
  await srv.accounts.store.saveStats(user.id, st);
  // 서버 보스: 원하는 페이즈 · 소식 몇 줄
  const now = Date.now();
  const s = R2.newBoss(L.weekIndex(now), 3, 40, now);
  s.hp.body = Math.round(s.hpMax * (PH === 3 ? 0.21 : PH === 2 ? 0.52 : 0.83));
  if (PH >= 2) s.by.p2 = { uid: 'x', n: '랑방짱', at: now - 3600e3 };
  s.feed = [{ t: now - 60e3, n: '호찬', k: 'hit', d: 812345 }, ...(PH >= 2 ? [{ t: now - 3600e3, n: '랑방짱', k: 'phase', p: 'p2' }] : [])];
  s.board = { x: { n: '랑방짱', d: 5e6, r: 3, c: 0, lh: 1 } };
  await srv.accounts.raid2._setState(s);
  const browser = await puppeteer.launch({ executablePath: BROWSERS.find((p) => fs.existsSync(p)), headless: 'new', args: ['--mute-audio'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const base = `http://localhost:${port}/langbang/`;
  await page.goto(base + '?nogate', { waitUntil: 'networkidle0' });
  await page.evaluate((t) => { localStorage.setItem('chandem:auth', JSON.stringify(t)); }, token);
  await page.goto(base + '?nogate&raid=1', { waitUntil: 'networkidle0' });
  await wait(2500);
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `raid2-${name}.png`) }); console.log('shot', name); };
  await shot(`lobby-p${PH}`);
  await page.evaluate(() => { const s = document.querySelector('.screen.r2-screen') || document.querySelector('.r2-screen'); if (s) s.scrollTop = 470; });
  await wait(400);
  await shot(`lobby-p${PH}-2`);
  await page.evaluate(() => { const s = document.querySelector('.r2-screen'); if (s) s.scrollTop = 1000; });
  await wait(400);
  await shot(`lobby-p${PH}-3`);
  // 도전 (도우미 고르기 창이 뜨면 그냥 닫기)
  await page.evaluate(() => { const s = document.querySelector('.r2-screen'); if (s) s.scrollTop = 0; document.querySelector('[data-act="raidGo"]').click(); });
  await wait(900);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /없이|혼자|건너뛰기|그냥/.test(x.textContent)); if (b) b.click(); });
  let ok = false;
  for (let k = 0; k < 40 && !ok; k++) { await wait(250); ok = await page.evaluate(() => { const g = window.__lb.g; return !!(g && g.r2 && !g.over); }); }
  console.log('in fight:', ok);
  if (ok) {
    const clean = () => page.evaluate(() => { const g = window.__lb.g; if (g) { g.augOffer = null; g.pendingLevels = 0; g.god = true; } for (const c of document.querySelectorAll('#cardstrip, .tip, .lb-tip')) c.hidden = true; });
    await wait(5000); await clean(); await wait(300);
    await shot('fight-idle');
    // 내려찍기 예고
    await page.evaluate(() => { const g = window.__lb.g; g.r2.act = { k: 'slam', st: 'wind', t: 1.6, x: 110, n: 1 }; g.r2.nextT = 9; });
    await wait(900); await clean();
    await shot('fight-wind');
    await wait(900);
    await shot('fight-slam');
    // 고지서 · 돈다발
    await page.evaluate(() => { const g = window.__lb.g; g.r2.act = { k: 'bills', st: 'throw', t: 1.2 }; g.r2.nextT = 9; g.r2.marks.push({ k: 'bill', x: 90, y: g.ropeY, t: 0.9, t0: 1.2 }, { k: 'bill', x: 250, y: g.ropeY, t: 0.6, t0: 1.2 }, { k: 'cash', x: g.heroes[0].x, y: g.heroes[0].y, t: 1.0, t0: 1.7 }); });
    await wait(450); await clean();
    await shot('fight-throw');
    // 입구 붙잡기
    await page.evaluate(() => { const g = window.__lb.g; g.r2.marks = []; g.r2.act = { k: 'grab', st: 'hold', t: 3, hits: 0, x: 180 }; g.r2.nextT = 9; });
    await wait(700); await clean();
    await shot('fight-grab');
    // 분노
    await page.evaluate(() => { const g = window.__lb.g; g.r2.act = null; g.r2.phase = 3; g.r2.angry = 4; g.r2.nextT = 9; });
    await wait(700); await clean();
    await shot('fight-rage');
    // 입구 부서짐 → 결과
    await page.evaluate(() => { const g = window.__lb.g; g.god = false; g.r2.nextT = 99; g.base.hp = 1; window.__lb.S.damageBase ? window.__lb.S.damageBase(g, 999, g.r2.parts.body) : (g.base.hp = 0); });
    await wait(3500);
    await shot('result');
  }
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close(); await srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
