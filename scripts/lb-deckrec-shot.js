'use strict';
// 추천 덱 화면 찍기 — node scripts/lb-deckrec-shot.js <저장 폴더> [스테이지=24]
//  기절 예고 판에서: 경고 있는 덱 → 추천 덱 → 이유 칩 → ⓘ 설명 시트
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
const ST = Number(process.argv[3] || 24);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  await srv.accounts.ready;
  const { token, user } = await srv.accounts.signup({ username: `dr${Date.now() % 1e6}`, password: 'secret12', nickname: '추천' });
  const st = (await srv.accounts.store.byId(user.id)).stats;
  const lb = st.langbang;
  lb.stages = Object.fromEntries(Array.from({ length: ST - 1 }, (_, i) => [i + 1, 3]));
  lb.maxStage = ST - 1;
  const own = ['jungmin', 'ingyu', 'eunok', 'sanghwa', 'myunghoon', 'hanna', 'dohoon', 'sunggu'];
  lb.owned = Object.assign({}, lb.owned, Object.fromEntries(own.map((h) => [h, true])));
  lb.heroes = Object.assign({}, lb.heroes, Object.fromEntries([...own, 'bangjang', 'staff', 'gunman', 'gunnyeo'].map((h) => [h, 3])));
  lb.tutDone = true; lb.coins = 500; lb.deckSlots = 5;
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
      localStorage.setItem('chandem:auth', JSON.stringify(t)); localStorage.setItem('langbang:acqSeen', JSON.stringify(ids));
      localStorage.setItem('langbang:pushAsked', '1'); localStorage.setItem('langbang:coachSeen', '{"hero":1,"gear":1}');
      localStorage.setItem('langbang:patchSeen', '2026-10-24deckrec');
      try { const rs = {}; for (let i = 0; i < 99; i++) rs['x' + i] = 1; } catch (e) { /* 무시 */ }
      localStorage.setItem('langbang:decks', JSON.stringify({ i: 0, decks: [['bangjang', 'staff', 'gunman', 'eunok', 'hanna'], [], []] }));
    }, token, ids);
    await page.goto(base + '?nogate&notut', { waitUntil: 'networkidle0' });
    await wait(2500);
    const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('shot', name); };
    const closePop = () => page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (/나중에|닫기|확인|완료/.test(b.textContent) && b.closest('.pop, .modal, .popup, .patch')) b.click(); });
    await closePop(); await wait(400);
    // 규칙 안내 카드가 뜨지 않게 모든 규칙을 본 것으로
    await page.evaluate(() => { try { const m = {}; for (let s = 1; s <= 30; s++) for (const c of ['cc', 'stealth', 'shield', 'armor', 'swarm', 'rush']) m['cond:' + c] = 1; for (const f of ['rain','fog','blackout','happy','karaoke','icy','feast','construction','megaphone','conveyor','wind','campfire','snow','lightshow','blizzard','champagne','songnoise']) m['fx:' + f] = 1; localStorage.setItem('langbang:ruleSeen', JSON.stringify({ g: m, '추천': m })); } catch (e) { /* 무시 */ } });
    await page.evaluate((s) => window.__lb.prep('stage', s), ST);
    await wait(1500);
    for (let k = 0; k < 10; k++) { const had = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^확인/.test(x.textContent.trim())); if (b) { b.click(); return true; } return false; }); if (!had) break; await wait(400); }
    await closePop(); await wait(300);
    await page.evaluate(() => { const el = document.querySelector('.pp-lack'); if (el) el.scrollIntoView({ block: 'center' }); });
    await wait(300);
    await shot('1-before-warning');
    console.log('before:', await page.evaluate(() => (document.querySelector('.pp-lack') || {}).innerText || '(경고 없음)'));
    await page.evaluate(() => { const b = document.querySelector('[data-act="autoDeck"]'); if (b) b.click(); });
    await wait(1200);
    await page.evaluate(() => { const el = document.querySelector('.rec-why'); if (el) el.scrollIntoView({ block: 'center' }); });
    await wait(300);
    await shot('2-after-reason-chips');
    console.log('chips:', await page.evaluate(() => (document.querySelector('.rec-why') || {}).innerText || '(칩 없음)'));
    console.log('after warn:', await page.evaluate(() => (document.querySelector('.pp-lack') || {}).innerText || '(경고 없음)'));
    await page.evaluate(() => { const b = document.querySelector('.rec-why [data-act="recInfo"]') || document.querySelector('[data-act="recInfo"]'); if (b) b.click(); });
    await wait(600);
    await shot('3-info-sheet');
    await closePop(); await wait(200);
    await page.keyboard.press('Escape');
  } finally {
    await browser.close();
    await srv.close();
  }
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
