'use strict';
// 전투 화면 배치 측정 + 스크린샷 — node scripts/lb-layout-shot.js <저장 폴더> <태그: before|after> [extra query, 예: camz=1]
//  폰 3종(360x640 · 360x800 · 412x915) × 장면(웨이브 시작 · 중간 · 입구 10~20마리 · 보스 · 6멤버 · 헬 · 무한 25웨이브) → 숫자(JSON) + 그림
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
const TAG = process.argv[3] || 'before';
const EXTRA = process.argv[4] || '';
const VPS = [[360, 640], [360, 800], [412, 915]];
const DECK6 = ['dohoon', 'eunok', 'myunghoon', 'hanna', 'ingyu', 'sunggu'];
const DECK5 = ['dohoon', 'eunok', 'myunghoon', 'hanna', 'ingyu', null];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  await srv.accounts.ready;
  const { token, user } = await srv.accounts.signup({ username: `ly${Date.now() % 1e6}`, password: 'secret12', nickname: '배치찍사' });
  const st = (await srv.accounts.store.byId(user.id)).stats;
  const lb = st.langbang;
  lb.stages = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, 3]));
  lb.maxStage = 20;
  const own = ['dohoon', 'eunok', 'myunghoon', 'hanna', 'ingyu', 'sunggu', 'jungmin', 'wonsik', 'jieun'];
  lb.owned = Object.assign({}, lb.owned, Object.fromEntries(own.map((h) => [h, true])));
  lb.heroes = Object.assign({}, lb.heroes, Object.fromEntries([...own, 'bangjang', 'staff', 'gunman', 'gunnyeo'].map((h) => [h, 11])));
  lb.hstars = Object.fromEntries(Object.keys(lb.heroes).map((h) => [h, 2]));
  lb.tutDone = true; lb.items = Object.assign({}, lb.items, { slot5: 1, slot6: 1 });
  await srv.accounts.store.saveStats(user.id, st);
  const browser = await puppeteer.launch({ executablePath: BROWSERS.find((p) => fs.existsSync(p)), headless: 'new', args: ['--mute-audio'] });
  const errors = [];
  const rows = [];
  try {
    for (const [vw, vh] of VPS) {
      const page = await browser.newPage();
      await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1, isMobile: true, hasTouch: false });
      page.on('pageerror', (e) => errors.push(e.message));
      const base = `http://localhost:${port}/langbang/`;
      const q = (extra) => `?nogate&notut&god=1&nojoin${EXTRA ? '&' + EXTRA : ''}${extra ? '&' + extra : ''}`;
      await page.goto(base + q(), { waitUntil: 'networkidle0' });
      await page.evaluate((t) => { localStorage.setItem('chandem:auth', JSON.stringify(t)); localStorage.setItem('langbang:hell', '0'); }, token);
      const vp = `${vw}x${vh}`;
      const shot = async (name) => { await closePop(); await page.screenshot({ path: path.join(OUT, `${vp}-${name}-${TAG}.png`) }); };
      const closePop = () => page.evaluate(() => { document.querySelectorAll('.reveal').forEach((e) => e.remove()); for (const b of document.querySelectorAll('button')) if (/나중에/.test(b.textContent)) b.click(); });
      const begin = async (deck, stage, o = {}) => {
        await page.goto(base + q(o.query), { waitUntil: 'networkidle0' });
        await wait(1800); await closePop(); await wait(300);
        await page.evaluate((d, hell) => { const a = window.__lb.app; a.decks[a.deckI] = d; a.hellMode = hell; }, deck, !!o.hell);
        await page.evaluate((s) => window.__lb.startRun(null, s, s === 0 ? 'endless' : 'stage'), stage);
        for (let k = 0; k < 40; k++) { await wait(250); if (await page.evaluate(() => { const g = window.__lb.g; return !!(g && g.phase === 'wave'); })) break; }
      };
      const metrics = (name) => page.evaluate((nm) => {
        const L = window.__lb, g = L.g; if (!g) return null;
        const hs = g.heroes.filter((h) => !h.gone), es = g.enemies.filter((e) => !e.dead && e.y > -10);
        const cv = document.querySelector('#cv').getBoundingClientRect();
        const sc = cv.width / g.W; // css px / logical px
        const rope = es.filter((e) => e.atRope); const skb = document.querySelector('#skillbar'); const chips = skb ? [...skb.querySelectorAll('.sk, .sk em')] : []; const hudTop = chips.length ? Math.round(Math.min(...chips.map((c) => c.getBoundingClientRect().top)) - cv.top) : null; const feet = Math.round((g.rowY + 82 * 0.3) * sc); const lvChip = document.querySelector('.hlv, .lvchip');
        // 입구 앞 군집: 격자 래스터로 겹침 % (몸 폭 = size*0.62)
        let sum = 0; const cell = new Set();
        for (const e of rope) { const w = e.def.size * 0.62, h = e.def.size * 0.7; sum += w * h; for (let x = Math.floor(e.x - w / 2); x < e.x + w / 2; x += 2) for (let y = Math.floor(e.y - h); y < e.y; y += 2) cell.add(x + ',' + y); }
        const uni = cell.size * 4;
        const xs = rope.map((e) => e.x), ys = rope.map((e) => e.y);
        const hx = hs.map((h) => h.x).sort((a, b) => a - b);
        const gap = hx.length > 1 ? Math.min(...hx.slice(1).map((v, i) => v - hx[i])) : 0;
        const act = es.length ? es.map((e) => e.y) : [0];
        // 멤버 ↔ 문 때리는 적 거리
        let dmin = 1e9, dsum = 0, dn = 0;
        for (const e of rope) for (const h of hs) { const d = Math.hypot(e.x - h.x, e.y - h.y); dmin = Math.min(dmin, d); dsum += d; dn++; }
        return { nm, vp: `${innerWidth}x${innerHeight}`, H: g.H, rowY: g.rowY, ropeY: g.ropeY, scale: +sc.toFixed(3), canvasCss: [Math.round(cv.width), Math.round(cv.height)], nEnemy: es.length, nRope: rope.length,
          overlapPct: sum ? Math.round((1 - uni / sum) * 100) : 0, ropeSpanX: xs.length ? [Math.round(Math.min(...xs)), Math.round(Math.max(...xs))] : null, ropeSpanY: ys.length ? [Math.round(Math.min(...ys)), Math.round(Math.max(...ys))] : null,
          heroGap: Math.round(gap), nHero: hs.length, heroBoxPx: Math.round(82 * 0.85 * sc), actionTopY: Math.round(Math.min(...act)), enemyMedianY: Math.round(act.sort((a, b) => a - b)[act.length >> 1]),
          dMinHeroEnemy: dmin < 1e9 ? Math.round(dmin) : null, dAvgHeroEnemy: dn ? Math.round(dsum / dn) : null, hudTopPx: hudTop, heroFeetPx: feet, hudClear: hudTop === null ? null : hudTop - feet, zoom: L.R.K ? +(L.R.K / L.R.k).toFixed(3) : 1 };
      }, name);
      const log = async (name) => { const m = await metrics(name); if (m) { rows.push(m); console.log(JSON.stringify(m)); } };
      const press = async (n) => { for (let k = 0; k < n; k++) { await wait(500); await page.evaluate(() => { const L = window.__lb; if (L.app.cardsOpen) L.pickCard(0); else if (L.g && L.g.pendingLevels > 0) L.openCards(); }); } };
      const fillDoor = (n, type, bossType) => page.evaluate((n, type, bossType) => {
        const L = window.__lb, g = L.g;
        const types = type || ['yeokko', 'namkko', 'drunk', 'thug', 'mukti', 'scammer'];
        for (let i = 0; i < n; i++) { const e = L.S.spawnEnemy(g, types[i % types.length], undefined, g.ropeY - 40 - Math.random() * 30, { hpMul: 60 }); e.y = e.stopY; e.atRope = true; }
        if (bossType) { const e = L.S.spawnEnemy(g, bossType, 180, g.ropeY - 40, { hpMul: 60 }); e.y = e.stopY; e.atRope = true; }
      }, n, type, bossType);

      // 1. 웨이브 시작(스테이지 1-1) · 5멤버
      await begin(DECK5, 1); await wait(1500); await shot('1-start'); await log('wave-start');
      // 2. 중간
      await press(24); await shot('2-mid'); await log('mid-fight');
      // 3. 문 때리는 10 · 20마리
      await fillDoor(10); await wait(1200); await shot('3-door10'); await log('door10');
      await fillDoor(10); await wait(1200); await shot('3-door20'); await log('door20');
      // 4. 보스
      const bossId = 'boss_thug';
      await begin(DECK6, 5); await press(8);
      if (bossId) { await fillDoor(6, null, bossId); await wait(1200); }
      await shot('4-boss'); await log('boss-door');
      // 5. 6멤버 (스테이지 8) · 입구 12마리
      await begin(DECK6, 8); await press(10); await fillDoor(12); await wait(1500); await shot('5-deck6'); await log('deck6-door12');
      for (const zz of (TAG === 'before' ? [1.15, 1.25] : [])) { await page.evaluate((z) => { const f = window.__lb.R.fx, g = window.__lb.g; clearInterval(window.__zi); window.__zi = setInterval(() => { f.zoom = z; f.zx = 180; f.zy = g.rowY + 25; }, 5); }, zz); await wait(400); await shot('5z' + Math.round(zz * 100) + '-deck6-zoomtest'); await page.evaluate(() => { clearInterval(window.__zi); }); }
      // 6. 헬
      await begin(DECK6, 10, { hell: true }); await press(10); await fillDoor(12); await wait(1500); await shot('6-hell'); await log('hell-door12');
      // 7. 무한 25웨이브
      await begin(DECK6, 0, { query: 'wave=25' }); await press(10); await shot('7-endless25'); await log('endless25');
      await page.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, `metrics-${TAG}.json`), JSON.stringify(rows, null, 1));
    console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
    await browser.close();
    await srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
