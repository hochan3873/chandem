'use strict';
// 1:1 대전 화면 찍기 (AI 상대) — node scripts/lb-pvp-shot.js <저장 폴더> [초]
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
(async () => {
  const srv = createServer({ port: 0, lbpvp: { botAfterMs: 300, aiNoticeMs: 0 } });
  const port = await srv.listen();
  const browser = await puppeteer.launch({ executablePath: BROWSERS.find((p) => fs.existsSync(p)), headless: 'new', args: ['--mute-audio'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const base = `http://localhost:${port}/langbang/`;
  await page.goto(base + '?nogate', { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.setItem('langbang:guest', JSON.stringify({ stages: { 1: 3, 2: 3, 3: 3, 4: 3 }, heroes: {} })); });
  await page.goto(base + '?nogate&god', { waitUntil: 'networkidle0' });
  await wait(1500);
  await page.evaluate(() => document.querySelector('[data-act="nav"][data-tab="pvp"]').click()); await wait(1200);
  await page.evaluate(() => document.querySelector('[data-act="pvpQuick"]').click());
  let ok = false;
  for (let k = 0; k < 60 && !ok; k++) { await wait(250); ok = await page.evaluate(() => { const g = window.__lb.g; return !!(g && g.pvp && !g.over && g.pvp.clock > 0.5); }); }
  console.log('in match:', ok);
  const sec = Number(process.argv[3] || 12);
  await wait(sec * 1000);
  await page.evaluate(() => { const L = window.__lb; if (L.g) { L.g.augOffer = null; L.g.pendingLevels = 0; } for (const c of document.querySelectorAll('#cardstrip')) c.hidden = true; });
  await page.screenshot({ path: path.join(OUT, 'pvp-panel.png') });
  // 크게 보기 (카드 누르기)
  await page.evaluate(() => document.getElementById('oppcard').click()); await wait(400);
  await page.screenshot({ path: path.join(OUT, 'pvp-panel-open.png') });
  await page.evaluate(() => document.getElementById('oppcard').click()); await wait(300);
  // 단계 띠: 화면 시계만 앞으로 (서버 판정과 상관없음)
  for (const [sec, name] of [[89.6, 'phase1'], [149.6, 'phase2'], [209.6, 'phase3']]) {
    await page.evaluate((sec) => { const L = window.__lb; const t = L.S.pvpTime(L.g); L.pvpUi.shift(sec - t); }, sec);
    await wait(450);
    await page.evaluate(() => { const L = window.__lb; if (L.g) L.g.augOffer = null; });
    await page.screenshot({ path: path.join(OUT, 'pvp-' + name + '.png') });
    console.log(name, await page.evaluate(() => ({ ph: window.__lb.g.pvp.phase, ban: (document.querySelector('.pv-ban b') || {}).textContent, en: window.__lb.g.enemies.filter((e) => !e.dead).length, card: !document.getElementById('oppcard').hidden, dots: ((window.__lb.app.g && 1) || 0) })));
  }
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close(); await srv.close(); process.exit(0);
})();
