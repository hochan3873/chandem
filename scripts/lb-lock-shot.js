'use strict';
// '풀 때까지' 상태이상 화면 찍기 — node scripts/lb-lock-shot.js <저장 폴더> [스테이지=65]
//  출전 준비 (헬 7장: 풀 때까지 경고) → 헬 판 중간에 멤버 묶기 (자물쇠 · 깜빡이는 테두리) → 해제! → 예고 · 면역! → 무한 출전 준비
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
const ST = Number(process.argv[3] || 65);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  await srv.accounts.ready;
  const { token, user } = await srv.accounts.signup({ username: `lk${Date.now() % 1e6}`, password: 'secret12', nickname: '자물쇠' });
  const st = (await srv.accounts.store.byId(user.id)).stats;
  const lb = st.langbang;
  lb.stages = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [i + 1, 3]));
  lb.maxStage = 80;
  const own = ['donghan', 'ara', 'sunggu', 'hyungyeong', 'dohoon', 'eunok', 'myunghoon', 'hanna', 'ingyu', 'jungmin', 'wonsik', 'youngjun', 'soyoung'];
  lb.owned = Object.assign({}, lb.owned, Object.fromEntries(own.map((h) => [h, true])));
  lb.heroes = Object.assign({}, lb.heroes, Object.fromEntries([...own, 'bangjang', 'staff', 'gunman', 'gunnyeo'].map((h) => [h, 18])));
  lb.hstars = Object.fromEntries(Object.keys(lb.heroes).map((h) => [h, 3]));
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
    const ids = ['wonsik', 'jeongseob', 'hyungyeong', 'ingyu', 'sunggu', 'bangjang', 'jungmin', 'gunnyeo', 'dohoon', 'ara', 'byunghwa', 'donghan', 'soyoung', 'eunok', 'hochan', 'baul', 'dragon', 'junseo', 'jieun', 'subin', 'youngjun', 'staff', 'hanna', 'jiwon', 'myunghoon', 'sanghwa', 'gunman', 'junyoung']; // 합류 연출 안 뜨게
    await page.goto(base + '?nogate&notut', { waitUntil: 'networkidle0' });
    await page.evaluate((t, ids) => {
      localStorage.setItem('chandem:auth', JSON.stringify(t)); localStorage.setItem('langbang:hell', '1'); localStorage.setItem('langbang:acqSeen', JSON.stringify(ids)); localStorage.setItem('langbang:patchSeen', '2026-10-11b');
      localStorage.setItem('langbang:decks', JSON.stringify({ i: 0, decks: [['youngjun', 'ara', 'donghan', 'eunok', 'staff', 'hyungyeong'], [], []] })); // 푸는 멤버 없는 덱 (경고가 보이게)
    }, token, ids);
    await page.goto(base + '?nogate&notut&god', { waitUntil: 'networkidle0' });
    await wait(2500);
    const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('shot', name); };
    const closePop = () => page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (/나중에|닫기|확인/.test(b.textContent) && b.closest('.pop, .modal, .popup, .patch')) b.click(); });
    await closePop(); await wait(400);
    await page.evaluate(() => { window.__lb.app.hellMode = true; });
    await page.evaluate((s) => window.__lb.prep('stage', s), ST);
    await wait(1200);
    await closePop(); await wait(300);
    await page.evaluate(() => { const b = document.querySelector('[data-act="hellMode"][data-v="1"]'); if (b) b.click(); });
    await wait(1800);
    await page.evaluate(() => { const el = document.querySelector('.pp-lock'); if (el) el.scrollIntoView({ block: 'center' }); });
    await wait(300);
    await shot('1-prep-hell-lock');
    // 헬 판 중간
    await page.evaluate(() => { window.__lb.app.hellMode = true; });
    await page.evaluate((s) => window.__lb.startRun(null, s, 'stage'), ST);
    for (let k = 0; k < 40; k++) { await wait(250); const ok = await page.evaluate(() => { const g = window.__lb.g; return !!(g && g.phase === 'wave'); }); if (ok) break; }
    for (let k = 0; k < 36; k++) { await wait(500); await page.evaluate(() => { const L = window.__lb; if (L.app.cardsOpen) L.pickCard(0); else if (L.g && L.g.pendingLevels > 0) L.openCards(); }); }
    const info = await page.evaluate(() => { const g = window.__lb.g; return g ? { hell: g.hell, wave: g.wave, heroes: g.heroes.length, ccLock: g.ccLock, ccCurse: g.ccCurse, dur: g.ccDur } : null; });
    console.log('battle', JSON.stringify(info));
    // 멤버 둘 묶기 (기절 · 홀림) — sim 의 ccLockTry 그대로
    const lockN = await page.evaluate(() => {
      const { g, S } = window.__lb; let n = 0;
      const hs = g.heroes.filter((h) => !h.def.summon && !h.gone);
      const kinds = ['stun', 'charm'];
      for (const h of hs.slice(0, 2)) { const k = kinds[n]; if (k === 'stun') h.stunT = 3; else h.charmT = 3; g.lockAt = -99; if (S.ccLockTry(g, h, k)) n++; }
      return [n, hs.map((h) => [h.id, h.lockK || '', S.resPct(h, 'stun'), h.ccImmT || 0, h.stunT, h.charmT].join(':'))];
    });
    console.log('locked', JSON.stringify(lockN));
    await wait(350);
    await shot('2-lock');
    await wait(1600);
    await shot('3-lock-hold');
    // 해제!: 하나는 건전녀 간호처럼 (cleanseHero) · 하나는 방장 "버텨!" 처럼
    await page.evaluate(() => { const { g, S } = window.__lb; const hs = g.heroes.filter((h) => h.lockK); if (hs[0]) { S.cleanseHero(hs[0]); g.events.push({ type: 'cleanse', x: hs[0].x, y: hs[0].y }); } if (hs[1]) S.ccFree(g, hs[1], 'bangjang'); });
    await wait(260);
    await shot('4-free');
    // 예고 (풀 때까지 저주) · 면역!
    await wait(1200);
    await page.evaluate(() => {
      const { g } = window.__lb; const e = g.enemies.find((o) => !o.dead && o.y > 80) || { x: 180, y: 200, def: { size: 60 } };
      g.events.push({ type: 'condCcWarn', x: e.x, y: e.y - e.def.size * 0.6, sec: 1, lock: true });
      const hs = g.heroes.filter((h) => !h.def.summon && !h.gone);
      if (hs[2]) g.events.push({ type: 'lockBlock', hero: hs[2].id, kind: 'stun', x: hs[2].x, y: hs[2].y });
      if (hs[3]) g.events.push({ type: 'immune', hero: hs[3].id, kind: 'charm', x: hs[3].x, y: hs[3].y - 60 });
    });
    await wait(300);
    await shot('5-warn-immune');
    // 무한 출전 준비
    await page.evaluate(() => window.__lb.showScreen('menu'));
    await wait(800);
    await page.evaluate(() => window.__lb.prep('endless', 0));
    await wait(1200);
    await page.evaluate(() => { const el = document.querySelector('.pp-lock'); if (el) el.scrollIntoView({ block: 'center' }); });
    await wait(300);
    await shot('6-prep-endless');
  } finally {
    console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
    await browser.close();
    await srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
