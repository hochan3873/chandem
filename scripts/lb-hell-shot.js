'use strict';
// 헬 고르기 연출 · 보통/헬 판 중간 화면 찍기 — node scripts/lb-hell-shot.js <저장 폴더> [스테이지]
//  계정: 1~2장 ★★★ · 멤버 여럿 강화 → 출전 준비 (보통) → 헬 누름 (연출 순간 2장) → 보통 판 중간 → 헬 판 중간
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
const ST = Number(process.argv[3] || 17);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  await srv.accounts.ready;
  const { token, user } = await srv.accounts.signup({ username: `hs${Date.now() % 1e6}`, password: 'secret12', nickname: '헬찍사' });
  const st = (await srv.accounts.store.byId(user.id)).stats;
  const lb = st.langbang;
  lb.stages = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, 3]));
  lb.maxStage = 20;
  const own = ['dohoon', 'eunok', 'myunghoon', 'hanna', 'ingyu', 'sunggu', 'jungmin', 'wonsik', 'jieun'];
  lb.owned = Object.assign({}, lb.owned, Object.fromEntries(own.map((h) => [h, true])));
  lb.heroes = Object.assign({}, lb.heroes, Object.fromEntries([...own, 'bangjang', 'staff', 'gunman', 'gunnyeo'].map((h) => [h, 11])));
  lb.hstars = Object.fromEntries(Object.keys(lb.heroes).map((h) => [h, 2]));
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
    await page.goto(base + '?nogate&notut', { waitUntil: 'networkidle0' });
    await page.evaluate((t) => { localStorage.setItem('chandem:auth', JSON.stringify(t)); localStorage.setItem('langbang:hell', '0'); }, token);
    await page.goto(base + '?nogate&notut', { waitUntil: 'networkidle0' });
    await wait(2500);
    const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('shot', name); };
    await page.evaluate((s) => window.__lb.prep('stage', s), ST);
    await wait(1200);
    await shot('1-prep-normal');
    await page.evaluate(() => { const b = document.querySelector('[data-act="hellMode"][data-v="1"]'); if (b) b.click(); });
    await wait(180);
    await shot('2-hell-select-fx');
    await wait(330);
    await shot('3-hell-select-fx2');
    await wait(1400);
    await shot('4-prep-hell');
    // 보통 판 중간
    const fight = async (hell, name) => {
      await page.evaluate((h) => { const a = window.__lb.app; a.hellMode = h; }, hell);
      await page.evaluate((s) => window.__lb.startRun(null, s, 'stage'), ST);
      for (let k = 0; k < 40; k++) { await wait(250); const ok = await page.evaluate(() => { const g = window.__lb.g; return !!(g && g.phase === 'wave'); }); if (ok) break; }
      // 레벨업 카드는 바로 고르며 30초쯤 싸운다
      for (let k = 0; k < 60; k++) { await wait(500); await page.evaluate(() => { const L = window.__lb; if (L.app.cardsOpen) L.pickCard(0); else if (L.g && L.g.pendingLevels > 0) L.openCards(); }); }
      const info = await page.evaluate(() => { const g = window.__lb.g; return g ? { hell: g.hell, wave: g.wave, door: Math.round((g.base.hp / g.base.max) * 100), t: Math.round(g.t), enemies: g.enemies.filter((e) => !e.dead).length } : null; });
      console.log(name, JSON.stringify(info));
      await shot(name);
    };
    await fight(false, '5-battle-normal');
    await page.evaluate(() => window.__lb.showScreen('menu'));
    await wait(800);
    await fight(true, '6-battle-hell');
  } finally {
    console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
    await browser.close();
    await srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
