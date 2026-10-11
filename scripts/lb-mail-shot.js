'use strict';
// 우편함 · 우편 열기 연출 화면 찍기 — node scripts/lb-mail-shot.js <저장 폴더> [저장소 루트] [접두사]
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(process.argv[3] || path.join(__dirname, '..'));
const { createServer } = require(path.join(ROOT, 'server/index'));
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
const PRE = process.argv[4] || '';
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
    const base = `http://localhost:${port}/langbang/?nogate&notut`;
    const now = Date.now();
    const seed = {
      coins: 1200, tickets: 1, mailSeq: 3, gear: [], gearSeq: 0,
      mail: [
        { id: 1, title: '시즌 3 무한 도전 2위!', text: '시즌 보상이 도착했어요', from: '운영진', exp: now + 6 * 864e5, at: now, rw: { coins: 6000, tickets: 3, gear: 'epic', stones: 12 } },
        { id: 2, title: '친구가 보낸 선물', text: '오늘도 같이 지켜요!', from: '정소영', exp: now + 1 * 864e5, at: now - 3 * 864e5, rw: { coins: 800, tickets: 1 } },
        { id: 3, title: '무한 2단계 돌파!', text: '처음 돌파 보상', exp: now + 5 * 864e5, at: now, rw: { coins: 1500, stones: 3, wild: 1 } },
      ],
    };
    await page.goto(base, { waitUntil: 'networkidle0' });
    await page.evaluate((s) => {
      localStorage.setItem('langbang:pushAsked', '1'); localStorage.setItem('langbang:coachSeen', '{"hero":1,"gear":1}');
      localStorage.setItem('langbang:ruleSeen', '99'); localStorage.setItem('langbang:patchSeen', '999999');
      localStorage.setItem('langbang:guest', JSON.stringify(s));
    }, seed);
    await page.goto(base, { waitUntil: 'networkidle0' });
    await wait(2500);
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${PRE}${n}.png`) });
    await page.evaluate(() => { const b = document.querySelector('.lb-quick [data-act="mail"]'); if (b) b.click(); });
    await wait(700);
    await shot('1-list');
    // 모두 받기
    await page.evaluate(() => { const b = document.querySelector('.mail-pop [data-act="mailGet"][data-id="all"]'); if (b) b.click(); });
    await wait(250); await shot('2-start');
    await wait(600); await shot('3-mid');
    await wait(1100); await shot('4-end');
    // 건너뛰기 확인 (연출 중 눌러서 끝값)
    await page.evaluate(() => { const b = document.querySelector('.rv-ov .rv-ok'); if (b) b.click(); });
    await wait(500);
    // 줄이기
    const sk = { ...seed, mail: seed.mail.slice(1, 2), mailSeq: 3 };
    await page.evaluate((s) => { localStorage.setItem('langbang:guest', JSON.stringify(s)); }, sk);
    await page.reload({ waitUntil: 'networkidle0' }); await wait(2000);
    await page.evaluate(() => { document.body.classList.add('rm'); const b = document.querySelector('.lb-quick [data-act="mail"]'); if (b) b.click(); });
    await wait(600);
    await page.evaluate(() => { const b = document.querySelector('.mail-pop [data-act="mailGet"]'); if (b) b.click(); });
    await wait(500); await shot('5-rm');
    console.log('errors', errors.length ? errors : 'none');
  } finally { await browser.close(); await srv.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
