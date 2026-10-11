'use strict';
// 멤버 대기 모션 · 쓰러짐 모션 찍기 — node scripts/lb-idle-shot.js <저장 폴더> <접두어> [멤버,멤버,...]
//  판을 시작해 멈춘 뒤 (진상 · 투사체 치움) 멤버를 줄에 세우고
//   idle: 0.12초마다 12장 (대기) · kd: 쓰러짐 게이지를 손으로 흘려 4초 + 일어나기까지 16장 · battle.png 한 장
//  frames 는 멤버 줄 둘레만 잘라 <접두어>_idle_NN.png / <접두어>_kd_NN.png 로 저장 (이어 붙이기는 Pillow 로)
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
const PRE = process.argv[3] || 'shot';
const IDS = (process.argv[4] || 'bangjang,staff,gunman,gunnyeo,myunghoon').split(',');
const ONLY = process.argv[5] || 'all'; // all | idle | kd | battle
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  const browser = await puppeteer.launch({ executablePath: BROWSERS.find((p) => fs.existsSync(p)), headless: 'new', args: ['--mute-audio'] });
  const errors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: false });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) errors.push(m.text()); });
    await page.goto(`http://localhost:${port}/langbang/?nogate&notut&autostart&stage=1&god&nosave`, { waitUntil: 'networkidle0' });
    for (let k = 0; k < 60; k++) { await wait(250); if (await page.evaluate(() => !!(window.__lb.g && window.__lb.g.heroes.length))) break; }
    await wait(1500);
    const box = await page.evaluate((ids) => {
      const L = window.__lb, g = L.g; L.app.paused = true;
      g.heroes.length = 0; g.enemies.length = 0; g.projs.length = 0;
      for (const id of ids) { const h = L.S.addHero(g, id); if (h) { h.joinT = 9; h.cd = 99; h.skillCd = 99; } }
      g.events.length = 0;
      const cv = document.querySelector('#cv'), r = cv.getBoundingClientRect(), W = g.W || 360, H = g.H || 640;
      const sy = r.height / H, y = r.top + (g.rowY - 70) * sy;
      return { x: r.left, y: Math.max(0, y), width: r.width, height: 120 * sy };
    }, IDS);
    await wait(900);
    let n = 0;
    const snap = async (kind) => { await page.screenshot({ path: path.join(OUT, `${PRE}_${kind}_${String(n++).padStart(2, '0')}.png`), clip: box }); };
    if (ONLY === 'all' || ONLY === 'idle') { n = 0; for (let i = 0; i < 12; i++) { await snap('idle'); await wait(120); } }
    if (ONLY === 'all' || ONLY === 'battle') { await page.screenshot({ path: path.join(OUT, `${PRE}_battle.png`) }); }
    if (ONLY === 'all' || ONLY === 'kd') {
      n = 0;
      // 첫째 · 셋째 멤버를 쓰러뜨려 4초 흘리고 (일어나기) · 다른 멤버는 그대로
      const T = [0.02, 0.12, 0.22, 0.32, 0.45, 0.7, 1.2, 1.8, 2.4, 3.0, 3.5, 3.7, 3.82, 3.92, 4.0, 4.2];
      for (const s of T) {
        await page.evaluate((s) => { const g = window.__lb.g; for (const [i, h] of g.heroes.entries()) { if (i % 2) continue; if (s < 4) { h.kdSec = 4; h.kdT = 4 - s; h.kd = 100; h.kdMax = 100; } else if (h.kdT > 0) { h.kdT = 0; h.kd = 0; h.kdGrace = 1.5; window.__lb.S.ev && 0; } } }, s);
        await wait(40);
        await snap('kd');
      }
    }
  } finally {
    await browser.close();
    await srv.close();
    if (errors.length) console.log('errors:', errors.slice(0, 5).join('\n'));
    console.log('done');
  }
})();
