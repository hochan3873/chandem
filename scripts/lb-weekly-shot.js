'use strict';
// 주간 도전 화면 찍기 — node scripts/lb-weekly-shot.js <저장 폴더> [접두어] [maxStage]
//  계정: maxStage 까지 ★★★ · 멤버 여럿 강화 → 주간 도전 화면 → 판 시작 (배너) → 판 중간 → (있으면) 계약 선택 → 결과 화면
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
const PRE = process.argv[3] || 'shot';
const MAX = Number(process.argv[4] || 30);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  await srv.accounts.ready;
  const { token, user } = await srv.accounts.signup({ username: `wk${Date.now() % 1e6}`, password: 'secret12', nickname: '주간찍사' });
  const st = (await srv.accounts.store.byId(user.id)).stats;
  const lb = st.langbang;
  lb.stages = Object.fromEntries(Array.from({ length: MAX }, (_, i) => [i + 1, 3]));
  lb.maxStage = MAX;
  const own = ['dohoon', 'eunok', 'myunghoon', 'hanna', 'ingyu', 'sunggu', 'jungmin', 'wonsik', 'jieun', 'donghan', 'youngjun'];
  lb.owned = Object.assign({}, lb.owned, Object.fromEntries(own.map((h) => [h, true])));
  lb.heroes = Object.assign({}, lb.heroes, Object.fromEntries([...own, 'bangjang', 'staff', 'gunman', 'gunnyeo'].map((h) => [h, 13])));
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
    await page.evaluate((t) => { localStorage.setItem('chandem:auth', JSON.stringify(t)); localStorage.setItem('langbang:pushAsked', '1'); }, token);
    await page.goto(base + '?nogate&notut', { waitUntil: 'networkidle0' });
    await wait(2500);
    const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${PRE}-${name}.png`) }); console.log('shot', name); };
    const closePop = () => page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (/나중에|닫기|확인/.test(b.textContent) && b.offsetParent) b.click(); });
    await closePop(); await wait(400);
    const click = (sel) => page.evaluate((q) => { const b = document.querySelector(q); if (b) b.click(); return !!b; }, sel);
    await click('[data-act="lbModes"]'); await wait(900);
    console.log('weekly card', await click('[data-act="weekly"]'));
    await wait(1500);
    await shot('1-weekly');
    await page.evaluate(() => window.__lb.startRun(null, 1, 'weekly'));
    for (let k = 0; k < 40; k++) { await wait(250); const ok = await page.evaluate(() => { const g = window.__lb.g; return !!(g && g.t > 0.4); }); if (ok) break; }
    await wait(600);
    await shot('2-start');
    await wait(2600);
    await shot('2b-wave1');
    const tickPlay = async (n) => {
      for (let k = 0; k < n; k++) {
        await wait(500);
        const s = await page.evaluate(() => { const L = window.__lb, g = L.g; if (!g) return null; if (L.app.cardsOpen) L.pickCard(0); else if (g.pendingLevels > 0) L.openCards(); if (g.augOffer) L.S.applyAug(g, g.augOffer.opts[0]); return { w: g.wave, ph: g.phase, offer: !!g.wkOffer, over: g.over || g.phase === 'victory' }; });
        if (!s || s.over || s.offer) return s;
      }
      return null;
    };
    await tickPlay(50);
    const info = await page.evaluate(() => { const g = window.__lb.g; return g ? { wave: g.wave, door: Math.round((g.base.hp / g.base.max) * 100), t: Math.round(g.t), enemies: g.enemies.filter((e) => !e.dead).length } : null; });
    console.log('mid', JSON.stringify(info));
    await shot('3-mid');
    // 현상수배 · 보물 도둑 표시 (규칙과 상관없이 하나씩 붙여 본다)
    const marked = await page.evaluate(() => { const g = window.__lb.g; if (!g || !g.wk) return false; const S = window.__lb.S; const e = S.spawnEnemy(g, 'envthief', 120, 260); e.wkGob = true; const o = g.enemies.find((x) => !x.dead && !x.boss && !x.wkGob); if (o) o.wkMark = true; return true; });
    if (marked) { await wait(400); await shot('3b-marks'); }
    // 계약 선택 (새 주간) — 바로 띄워 본다
    const hasOffer = await page.evaluate(() => { const g = window.__lb.g; if (!g || !g.wk || !g.wk.forceOffer) return false; g.wk.forceOffer(g); return true; });
    if (hasOffer) { await wait(900); await shot('4-offer'); await page.evaluate(() => { const b = document.querySelector('[data-wkpact="2"]'); if (b) b.click(); }); await wait(600); }
    // 마지막 웨이브 보스 (새 주간) — 바로 마지막 웨이브로
    const boss = await page.evaluate(() => { const g = window.__lb.g; if (!g || !g.wk || !g.wk.jumpLast) return false; g.wk.jumpLast(g); return true; });
    if (boss) { await wait(1200); await shot('5-boss-intro'); await tickPlay(10); await page.evaluate(() => { const g = window.__lb.g; const b = g && g.enemies.find((e) => e.boss && !e.dead); if (b) b.hp = b.maxHp * 0.6; }); await wait(700); await shot('5b-boss-phase'); }
    // 결과 화면: 입구를 무너뜨려 끝낸다 (계약 창이 떠 있는 채로 끝나도 결과 위에 안 남는지)
    await page.evaluate(() => { const g = window.__lb.g; if (g && g.wk && g.wk.forceOffer) g.wk.forceOffer(g); });
    await wait(500);
    await page.evaluate(() => { const g = window.__lb.g; if (g && !g.over) { g.base.hp = 1; g.base.max = Math.max(1, g.base.max); for (let i = 0; i < 4; i++) window.__lb.S.spawnEnemy(g, 'drunk', 180, g.ropeY - 4); } });
    for (let k = 0; k < 40; k++) { await wait(500); const o = await page.evaluate(() => !!document.querySelector('#wkscore, .wk-break')); if (o) break; }
    await wait(2500);
    await shot('6-result');
    await page.evaluate(() => { const el = document.querySelector('.wk-break'); if (el) el.scrollIntoView({ block: 'center' }); });
    await wait(500);
    await shot('6b-result');
  } finally {
    console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
    await browser.close();
    await srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
