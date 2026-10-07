'use strict';
// 요일 건물주 화면 찍기 — node scripts/lb-raid2-days-shot.js <저장 폴더> [요일들 mon,tue,...] [난이도]
//  마스터 계정(테스트 판 · 서버 체력에 안 들어감)으로 요일을 골라 로비(일정표 · 오늘의 건물주) → 전투(대표 기술 예고 · 터짐) 를 찍는다
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
process.env.MASTER_USERS = 'shotmaster';
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
const DAYS = (process.argv[3] || 'mon,tue,wed,thu,fri,sat,sun').split(',');
const DF = process.argv[4] || 'normal';
// 요일마다 찍을 기술: [예고가 있는 대표 기술, 바로 던지는 기술]
const SIG = { mon: ['meter', 'bomb'], tue: ['contract', 'stamp'], wed: ['raise', 'slam'], thu: ['crew', 'leak'], fri: ['tow', 'rush'], sat: ['noise', 'broom'], sun: ['evict', 'vault'] };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const R2 = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'raid2.js')).href);
  const L = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'live.js')).href);
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  await srv.accounts.ready;
  const { token, user } = await srv.accounts.signup({ username: 'shotmaster', password: 'secret12', nickname: '찍사' });
  const st = (await srv.accounts.store.byId(user.id)).stats;
  st.langbang.stages = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i + 1, 3]));
  await srv.accounts.store.saveStats(user.id, st);
  const now = Date.now();
  const s = R2.newBoss(L.weekIndex(now), 3, 40, now);
  s.hp.body = Math.round(s.hpMax * 0.83);
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
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('shot', name); };
  const clean = () => page.evaluate(() => { const g = window.__lb.g; if (g) { g.augOffer = null; g.pendingLevels = 0; g.god = true; } for (const c of document.querySelectorAll('#cardstrip, .tip, .lb-tip, .toast')) c.hidden = true; });
  for (const day of DAYS) {
    await page.goto(base + '?nogate&raid=1', { waitUntil: 'networkidle0' });
    await wait(1800);
    await page.evaluate((d) => { const b = document.querySelector(`.r2-wd[data-id="${d}"]`); if (b) b.click(); }, day);
    await wait(1200);
    await page.evaluate(() => { const s = document.querySelector('.r2-screen'); if (s) s.scrollTop = 0; });
    await wait(300);
    await shot(`${day}-lobby`);
    await page.evaluate(() => { const s = document.querySelector('.r2-screen'); const d = document.querySelector('.r2-day'); if (s && d) s.scrollTop = d.offsetTop - 120; });
    await wait(400);
    await shot(`${day}-lobby2`);
    await page.evaluate((df) => { const b = document.querySelector(`.r2-d[data-id="${df}"]`); if (b) b.click(); }, DF);
    await wait(300);
    await page.evaluate(() => { const s = document.querySelector('.r2-screen'); if (s) s.scrollTop = 0; document.querySelector('[data-act="raidGo"]').click(); });
    await wait(900);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /없이|혼자|건너뛰기|그냥/.test(x.textContent)); if (b) b.click(); });
    let ok = false;
    for (let k = 0; k < 40 && !ok; k++) { await wait(250); ok = await page.evaluate(() => { const g = window.__lb.g; return !!(g && g.r2 && !g.over); }); }
    console.log(day, 'in fight:', ok, await page.evaluate(() => window.__lb.g && window.__lb.g.r2 && window.__lb.g.r2.day));
    if (!ok) continue;
    for (let k = 0; k < 60; k++) { await wait(250); if (await page.evaluate(() => window.__lb.g.phase === 'wave')) break; }
    await wait(1500); await clean();
    await page.evaluate(() => { const g = window.__lb.g; g.r2.nextT = 99; g.r2.act = null; });
    await wait(300);
    await shot(`${day}-fight-idle`);
    const [w, t] = SIG[day];
    await page.evaluate(async (k) => { const RS = await import('/langbang/raid2-sim.js'); const g = window.__lb.g; RS.forcePattern(g, k); g.r2.nextT = 99; if (g.r2.act) g.r2.act.hits = 1; }, w);
    await wait(900); await clean();
    await shot(`${day}-fight-wind-${w}`);
    for (let k = 0; k < 20; k++) { await wait(150); const st2 = await page.evaluate(() => { const a = window.__lb.g.r2.act; return a ? a.st : 'none'; }); if (st2 !== 'wind') break; }
    await wait(250); await clean();
    await shot(`${day}-fight-hit-${w}`);
    await page.evaluate(async (k) => { const RS = await import('/langbang/raid2-sim.js'); const g = window.__lb.g; g.r2.act = null; RS.forcePattern(g, k); g.r2.nextT = 99; }, t);
    await wait(700); await clean();
    await shot(`${day}-fight-${t}`);
    await wait(1300); await clean();
    await shot(`${day}-fight-${t}-2`);
    // 판 그만 (결과 화면 저장 안 함 · 다음 요일)
    await page.evaluate(() => { const g = window.__lb.g; g.god = false; g.base.hp = 0; g.over = true; });
    await wait(1500);
  }
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close(); await srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
