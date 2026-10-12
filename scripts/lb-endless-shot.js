'use strict';
// 무한 도전 (10/13 개편) 화면 찍기 — node scripts/lb-endless-shot.js <저장 폴더>
//  「자동」 버튼 (켜짐) · 정예 특성 표시 (방패 · 빠름 · 치유 · 분열 · 저항) · 단계 장 배너
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  await srv.accounts.ready;
  const { token, user } = await srv.accounts.signup({ username: `en${Date.now() % 1e6}`, password: 'secret12', nickname: '무한' });
  const st = (await srv.accounts.store.byId(user.id)).stats;
  const lb = st.langbang;
  lb.stages = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i + 1, 3]));
  lb.maxStage = 30;
  const own = ['donghan', 'ara', 'sunggu', 'hyungyeong'];
  lb.owned = Object.assign({}, lb.owned, Object.fromEntries(own.map((h) => [h, true])));
  lb.heroes = Object.assign({}, lb.heroes, Object.fromEntries([...own, 'bangjang', 'staff', 'gunman', 'gunnyeo'].map((h) => [h, 14])));
  lb.tutDone = true;
  await srv.accounts.store.saveStats(user.id, st);
  const browser = await puppeteer.launch({ executablePath: BROWSERS.find((p) => fs.existsSync(p)), headless: 'new', args: ['--mute-audio'] });
  const errors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: false });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const base = `http://localhost:${port}/langbang/`;
    const closePop = () => page.evaluate(() => { document.querySelectorAll('.reveal').forEach((e) => e.remove()); for (const b of document.querySelectorAll('button')) if (/나중에/.test(b.textContent)) b.click(); });
    await page.goto(base + '?nogate&notut', { waitUntil: 'networkidle0' });
    await page.evaluate((t) => {
      localStorage.setItem('chandem:auth', JSON.stringify(t)); localStorage.setItem('langbang:endAuto', '1'); localStorage.setItem('langbang:patchSeen', '2026-10-30endless');
      localStorage.setItem('langbang:decks', JSON.stringify({ i: 0, decks: [['gunnyeo', 'ara', 'donghan', 'sunggu', 'staff', 'hyungyeong'], [], []] }));
    }, token);
    for (const [wave, name] of [[8, '1-tier1-w8'], [34, '2-tier4-w34']]) {
      await page.goto(base + `?nogate&notut&god=1&wave=${wave}`, { waitUntil: 'networkidle0' });
      await wait(1800); await closePop(); await wait(300);
      await page.evaluate(() => window.__lb.startRun(null, 0, 'endless'));
      for (let k = 0; k < 60; k++) { await wait(250); if (await page.evaluate(() => { const g = window.__lb.g; return !!(g && g.phase === 'wave'); })) break; }
      // 특성 붙은 정예가 화면 안에 들어올 때까지
      let info = null;
      for (let k = 0; k < 60; k++) {
        await wait(250);
        info = await page.evaluate(() => { const g = window.__lb.g; const es = g.enemies.filter((e) => !e.dead && e.aff && e.y > 90 && e.y < g.ropeY); return { n: es.length, aff: es.map((e) => e.type + ':' + e.aff.join('+')), wave: g.wave, auto: g.autoSk, btn: (document.querySelector('#btn-auto') || {}).textContent, hidden: (document.querySelector('#btn-auto') || {}).hidden, skills: g.stats.skills }; });
        if (info.n >= 1 && k > 40) break;
      }
      await closePop();
      await page.screenshot({ path: path.join(OUT, `endless-${name}.png`) });
      console.log(name, JSON.stringify(info));
    }
  } finally {
    await browser.close();
    await srv.close();
  }
  if (errors.length) console.log('오류:', errors.slice(0, 5).join(' | '));
  process.exit(0);
})();
