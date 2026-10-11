'use strict';
// 새 장비! 연출 · 드롭 표 화면 찍기 — node scripts/lb-geardrop-shot.js <저장 폴더>
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  const browser = await puppeteer.launch({ executablePath: BROWSERS.find((p) => fs.existsSync(p)), headless: 'new', args: ['--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: false });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const base = `http://localhost:${port}/langbang/?nogate&tut`;
    await page.goto(base, { waitUntil: 'networkidle0' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(base, { waitUntil: 'networkidle0' });
    await wait(2500);
    for (const [name, r, tt] of [['epic', 'epic', 'megaphone'], ['legend', 'legend', 'belt']]) {
      await page.evaluate((r2, t2) => {
        const a = window.__lb.app, p = a.profile || (a.profile = {});
        p.gear = (p.gear || []).concat([{ id: 9001, t: t2, r: r2, lv: 0 }]);
        p.heroes = p.heroes || {};
        window.__lb.gearDrop([{ id: 9001, t: t2, r: r2 }]);
      }, r, tt);
      await wait(1800);
      await page.screenshot({ path: path.join(OUT, `reveal-${name}.png`) });
      await page.evaluate(() => { const b = document.querySelector('.gd-ok'); if (b) b.click(); });
      await wait(500);
    }
    await page.evaluate(() => window.__lb.dropTable());
    await wait(500);
    await page.screenshot({ path: path.join(OUT, 'droptable.png') });
    await page.evaluate(() => document.body.classList.add('rm'));
    await page.evaluate(() => { const b = document.querySelector('[data-x]'); if (b) b.click(); });
    await wait(400);
    await page.evaluate(() => window.__lb.gearDrop([{ id: 9001, t: 'belt', r: 'legend' }]));
    await wait(300);
    await page.screenshot({ path: path.join(OUT, 'reveal-rm.png') });
    console.log('errors', errors.length ? errors : 'none');
  } finally { await browser.close(); await srv.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
