'use strict';
// 규칙 안내 화면 찍기 — node scripts/lb-rules-shot.js <저장 폴더> [스테이지=23]
//  3-3 출전 준비 첫 만남 카드 → 닫은 뒤 준비 화면 → 전투 칩 → 칩 시트(판 멈춤) → 규칙 도감
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
const ST = Number(process.argv[3] || 23);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  await srv.accounts.ready;
  const { token, user } = await srv.accounts.signup({ username: `ru${Date.now() % 1e6}`, password: 'secret12', nickname: '규칙' });
  const st = (await srv.accounts.store.byId(user.id)).stats;
  const lb = st.langbang;
  lb.stages = Object.fromEntries(Array.from({ length: ST - 1 }, (_, i) => [i + 1, 3]));
  lb.maxStage = ST - 1;
  const own = ['eunok', 'sunggu', 'baul', 'staff', 'gunman', 'gunnyeo', 'dohoon'];
  lb.owned = Object.assign({}, lb.owned, Object.fromEntries(own.map((h) => [h, true])));
  lb.heroes = Object.assign({}, lb.heroes, Object.fromEntries([...own, 'bangjang'].map((h) => [h, 1])));
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
    const ids = Object.keys(lb.owned).concat(['bangjang', 'staff', 'gunman', 'gunnyeo']);
    const notes = await page.goto(base + 'patchnotes.js').then((r) => r.text());
    const latest = (notes.match(/id: '([^']+)'/) || [])[1];
    await page.goto(base + '?nogate&notut', { waitUntil: 'networkidle0' });
    const allIds = await page.evaluate(async () => Object.keys((await import('/langbang/data.js')).HEROES));
    await page.evaluate((t, ids, latest) => {
      localStorage.setItem('chandem:auth', JSON.stringify(t)); localStorage.setItem('langbang:acqSeen', JSON.stringify(ids)); localStorage.setItem('langbang:patchSeen', latest);
      localStorage.setItem('langbang:pushAsked', '1'); localStorage.setItem('langbang:coachSeen', JSON.stringify({ hero: 1, gear: 1 }));
      localStorage.setItem('langbang:decks', JSON.stringify({ i: 0, decks: [['bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon'], [], []] }));
    }, token, allIds, latest);
    await page.goto(base + '?nogate&notut', { waitUntil: 'networkidle0' });
    await wait(2500);
    const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('shot', name); };
    const click = (sel) => page.evaluate((s) => { const b = document.querySelector(s); if (b) b.click(); return !!b; }, sel);
    await page.evaluate((s) => window.__lb.prep('stage', s), ST);
    await wait(1800);
    await shot('1-explainer-card');
    console.log('card:', await page.evaluate(() => (document.querySelector('.rule-sheet') || {}).innerText || 'NONE'));
    // 확인 (다음 규칙이 있으면 이어서) — 둘째 카드도 한 장 찍기
    await click('[data-act="ruOk"]'); await wait(500);
    await shot('2-explainer-next');
    for (let k = 0; k < 8 && (await click('[data-act="ruOk"]')); k++) await wait(300);
    await wait(400);
    await shot('3-prep-fxrow');
    // 다시 들어와도 안 나온다
    await page.evaluate((s) => window.__lb.prep('stage', s), ST); await wait(1500);
    console.log('again popup?', await page.evaluate(() => !!document.querySelector('.rule-sheet')));
    // 준비 줄 누르기 → 규칙 도감 목록
    await click('.pc-fxrow'); await wait(500);
    await click('[data-act="ruDex"]'); await wait(600);
    await shot('4-rule-list-sheet');
    await click('.pop-x'); await wait(300);
    // 전투
    await page.evaluate((s) => window.__lb.startRun(null, s, 'stage'), ST);
    await wait(6000);
    await shot('5-battle-chip');
    await click('#rule-chip'); await wait(600);
    const paused1 = await page.evaluate(() => window.__lb.app.paused);
    await shot('6-battle-sheet');
    await click('.pop-x'); await wait(500);
    const paused2 = await page.evaluate(() => window.__lb.app.paused);
    console.log('paused open/closed', paused1, paused2);
    // 규칙 도감 탭
    await page.evaluate(() => { window.__lb.app.g.over = true; });
    await page.evaluate(() => { window.__lb.app.dexTab = 'rule'; const b = document.createElement('button'); b.dataset.act = 'dex'; document.getElementById('ui').appendChild(b); b.click(); });
    await wait(1200);
    await shot('7-rule-dex');
    await page.evaluate(() => { const r = document.querySelector('.ru-row'); if (r) r.click(); });
    await wait(500);
    await shot('8-rule-dex-card');
  } finally {
    await browser.close();
    await srv.close();
  }
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
