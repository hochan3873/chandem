'use strict';
// 멀리 서는 진상 · 지원형 진상 위협 읽힘 점검 — node scripts/lb-threat-shot.js <저장 폴더> <접두어> [종류,종류,...] [초] [판]
//  판 3-3 을 열고 진상 한 종류씩 세워 N초 지켜보며 (a) 매 표본 상태 (가만히 있는 비율) (b) 0.2초 간격 화면 조각 (이어 붙이기는 Pillow)
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
const PRE = process.argv[3] || 'threat';
const TYPES = (process.argv[4] || 'selfie,inpi_gossip,inpi_treasurer,sarcasm,snowball,badsinger,hw_witch').split(',');
const SEC = +(process.argv[5] || 16);
const STAGE = process.argv[6] || '3-3';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  const browser = await puppeteer.launch({ executablePath: BROWSERS.find((p) => fs.existsSync(p)), headless: 'new', args: ['--mute-audio'] });
  const errors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 1, isMobile: true });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${port}/langbang/?nogate&notut&autostart&stage=${STAGE}&god&nosave`, { waitUntil: 'networkidle0' });
    for (let k = 0; k < 60; k++) { await wait(250); if (await page.evaluate(() => !!(window.__lb.g && window.__lb.g.heroes.length))) break; }
    await wait(800);
    const res = {};
    for (const t of TYPES) {
      await page.evaluate((t) => {
        const L = window.__lb, g = L.g; g.enemies.length = 0; if (g.eprojs) g.eprojs.length = 0;
        if (g.spawnQ) { g.spawnQ.length = 0; g.spawnI = 0; }
        const e = L.S.spawnEnemy(g, t, 140, 60, {});
        window.__tr = { e }; window.__stat = { n: 0, idle: 0, act: 0, rope: 0 };
      }, t);
      let k = 0; const t0 = Date.now();
      while (Date.now() - t0 < SEC * 1000) {
        await page.evaluate(() => {
          document.querySelectorAll('body *').forEach((n) => { if (n.children.length < 6 && /^NEW|^새로|처음 만난/.test((n.textContent || '').trim()) && n.tagName !== 'BODY' && n.id !== 'cv') { let p = n; while (p.parentElement && p.parentElement !== document.body && getComputedStyle(p).position !== 'fixed' && getComputedStyle(p).position !== 'absolute') p = p.parentElement; p.style.display = 'none'; } });
          const e = window.__tr.e, st = window.__stat; if (!e || e.dead) return;
          st.n++;
          if (e.atRope) { st.rope++; if (e.castW > 0 || e.windup > 0 || e.hitT > 0 || e.flashW > 0 || e.actT > 0) st.act++; else st.idle++; }
        });
        if (k % 3 === 0 && k < 45) await page.screenshot({ path: path.join(OUT, `${PRE}_${t}_${String(k / 3).padStart(2, '0')}.png`), clip: { x: 0, y: 150, width: 360, height: 300 } });
        k++; await wait(60);
      }
      res[t] = await page.evaluate(() => { const g = window.__lb.g, e = window.__tr.e; return Object.assign({}, window.__stat, { dist: e ? Math.round(g.ropeY - e.y) : null, door: Math.round(g.base.hp) + '/' + Math.round(g.base.max) }); });
    }
    console.log(JSON.stringify(res));
  } finally { await browser.close(); await srv.close(); if (errors.length) console.log('errors:', errors.slice(0, 5).join('\n')); }
})();
