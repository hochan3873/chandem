'use strict';
// 실패 공략 카드 화면 찍기 — node scripts/lb-failguide-shot.js <저장 폴더> [스테이지=28]
//  약한 덱으로 지는 판 → 결과 화면 공략 카드 → 다시 도전(준비 화면 작은 카드) → 추천 덱으로
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
const ST = Number(process.argv[3] || 28);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  await srv.accounts.ready;
  const { token, user } = await srv.accounts.signup({ username: `fg${Date.now() % 1e6}`, password: 'secret12', nickname: '공략' });
  const st = (await srv.accounts.store.byId(user.id)).stats;
  const lb = st.langbang;
  lb.stages = Object.fromEntries(Array.from({ length: ST - 1 }, (_, i) => [i + 1, 3]));
  lb.maxStage = ST - 1;
  const own = ['dohoon', 'sunggu', 'ingyu', 'eunok', 'hanna', 'myunghoon'];
  lb.owned = Object.assign({}, lb.owned, Object.fromEntries(own.map((h) => [h, true])));
  lb.heroes = Object.assign({}, lb.heroes, Object.fromEntries([...own, 'bangjang', 'staff', 'gunman', 'gunnyeo'].map((h) => [h, 1])));
  lb.tutDone = true; lb.coins = 500;
  await srv.accounts.store.saveStats(user.id, st);
  const browser = await puppeteer.launch({ executablePath: BROWSERS.find((p) => fs.existsSync(p)), headless: 'new', args: ['--mute-audio'] });
  const errors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: false });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const base = `http://localhost:${port}/langbang/`;
    const ids = Object.keys(lb.owned).concat(['bangjang', 'staff', 'gunman', 'gunnyeo', 'jungmin', 'sanghwa', 'junyoung']);
    await page.goto(base + '?nogate&notut', { waitUntil: 'networkidle0' });
    await page.evaluate((t, ids) => {
      localStorage.setItem('chandem:auth', JSON.stringify(t)); localStorage.setItem('langbang:acqSeen', JSON.stringify(ids)); localStorage.setItem('langbang:patchSeen', '2026-10-13duel2');
      localStorage.setItem('langbang:decks', JSON.stringify({ i: 0, decks: [['bangjang', 'staff', 'gunman', 'ingyu', 'eunok'], [], []] }));
    }, token, ids);
    await page.goto(base + '?nogate&notut&speed=8', { waitUntil: 'networkidle0' });
    await wait(2500);
    const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('shot', name); };
    const closePop = () => page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (/나중에|닫기|확인/.test(b.textContent) && b.closest('.pop, .modal, .popup, .patch')) b.click(); });
    await closePop(); await wait(400);
    await page.evaluate((s) => window.__lb.startRun(null, s, 'stage'), ST);
    let done = false;
    for (let k = 0; k < 240 && !done; k++) {
      await wait(500);
      done = await page.evaluate(() => {
        const L = window.__lb; if (L.app.screen === 'result') return true;
        if (L.app.cardsOpen) L.pickCard(0); else if (L.g && L.g.pendingLevels > 0) L.openCards();
        return false;
      });
    }
    console.log('result?', done);
    await wait(1500);
    await page.evaluate(() => { const el = document.querySelector('.fg'); if (el) el.scrollIntoView({ block: 'center' }); });
    await wait(400);
    await shot('1-defeat-card');
    const html = await page.evaluate(() => (document.querySelector('.fg') || {}).innerText || '');
    console.log('card:', html.replace(/\n/g, ' | '));
    // 다시 도전 → 준비 화면 (작은 카드)
    await page.evaluate(() => { const b = document.querySelector('[data-act="again"]'); if (b) b.click(); });
    await wait(1500);
    await closePop(); await wait(300);
    await page.evaluate(() => { const el = document.querySelector('.fg.compact'); if (el) el.scrollIntoView({ block: 'center' }); });
    await wait(400);
    await shot('2-prep-compact');
    await page.evaluate(() => { const b = document.querySelector('[data-act="fgDeck"]'); if (b) b.click(); });
    await wait(1200);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot('3-prep-after-recdeck');
  } finally {
    await browser.close();
    await srv.close();
  }
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
