'use strict';
// 튜토리얼 화면 찍기 — node scripts/lb-tutorial-shot.js <저장 폴더>
//  새 손님(빈 기기)으로 로비 → 출전 준비 → 1-1 → 로비 → 1-2 → 1-3 을 손가락이 가리키는 곳을 눌러 가며 따라간다
//  · 말풍선이 바뀔 때마다 찍는다 · 마지막에 송바울 · 1:1 · 탑 처음 안내와 움직임 줄이기도 한 장씩 · 콘솔 오류를 모은다
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  const browser = await puppeteer.launch({ executablePath: BROWSERS.find((p) => fs.existsSync(p)), headless: 'new', args: ['--mute-audio'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: false });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const base = `http://localhost:${port}/langbang/?nogate&tut`;
  const EXTRA = process.argv[3] === 'extra'; // 로그인 계정 (12판 클리어 · 1-2 까지 배운 상태) → 1-3 · 송바울 · 1:1 · 탑 · 서버 저장
  let acct = null;
  if (EXTRA) {
    await srv.accounts.ready;
    acct = await srv.accounts.signup({ username: `tu${Date.now() % 1e6}`, password: 'secret12', nickname: '튜토찍사' });
    const st = (await srv.accounts.store.byId(acct.user.id)).stats; const lb = st.langbang;
    lb.stages = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 3])); lb.maxStage = 12;
    lb.owned = Object.assign({}, lb.owned, { baul: true, wonsik: true, jungmin: true });
    lb.tut = ['@on', 'start', 'start2', 'aug', 'cards', 'b1', 'lobby', 'upg', 'prep', 'skill', 'speed', 'ult', 'mail', 'checkin'];
    await srv.accounts.store.saveStats(acct.user.id, st);
  }
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.evaluate((t) => { localStorage.clear(); if (t) localStorage.setItem('chandem:auth', JSON.stringify(t)); }, acct && acct.token);
  await page.goto(base, { waitUntil: 'networkidle0' });
  await wait(2500);
  let n = 0;
  const shots = [];
  const shot = async (name) => { const f = `${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: path.join(OUT, f) }); shots.push(f); console.log('shot', f); };
  // 지금 떠 있는 말풍선: 레슨 · 비트 · 손가락 자리 · 누를 곳
  const beat = () => page.evaluate(() => {
    const L = document.querySelector('.tutor');
    if (!L || L.classList.contains('tu-hid')) return null;
    const say = L.querySelector('.tu-say'), hand = L.querySelector('.tu-hand'), ring = L.querySelector('.tu-ring');
    if (!say || !say.offsetWidth) return null;
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, l: b.left, t: b.top }; };
    const hv = hand && !hand.classList.contains('off') && hand.style.display !== 'none';
    return { txt: L.querySelector('.tu-txt').textContent.trim(), read: L.classList.contains('tu-read'), swipe: hand.classList.contains('h-swipe'), hand: hv ? r(hand) : null, ring: ring.style.display === 'none' ? null : r(ring), say: r(say) };
  });
  // 손가락을 따라 한다: 읽기면 말풍선 · 밀기면 대상을 왼쪽으로 · 그 밖엔 고리 가운데(필드 대상은 손가락 끝)
  const follow = async (b) => {
    if (b.read) { await page.mouse.click(b.say.x, b.say.y); return; }
    if (b.swipe && b.ring) { await page.mouse.move(b.ring.x + 70, b.ring.y); await page.mouse.down(); for (let k = 1; k <= 8; k++) { await page.mouse.move(b.ring.x + 70 - k * 22, b.ring.y); await wait(20); } await page.mouse.up(); return; }
    const p = b.hand ? { x: b.hand.l + 8, y: b.hand.t + 4 } : b.ring;
    if (p) await page.mouse.click(p.x, p.y);
  };
  // 길 안내(guide.js 코치)가 떠 있으면 그것도 따라간다 (강화 안내) · 처음 보는 단계는 찍는다
  const coachSeen = new Set();
  const followCoach = async () => {
    const c = await page.evaluate(() => {
      const L = document.querySelector('.coach'); if (!L) return null;
      const home = L.querySelector('.co-home'); if (home) { const b = home.getBoundingClientRect(); return { done: true, x: b.left + b.width / 2, y: b.top + b.height / 2 }; }
      if (L.classList.contains('wait')) return { wait: true };
      const r = L.querySelector('.co-ring').getBoundingClientRect(); const t = (L.querySelector('.co-bub') || {}).textContent || '';
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, t };
    });
    if (!c) return false;
    if (c.wait) return true;
    const k = c.done ? 'done' : c.t;
    if (!coachSeen.has(k)) { coachSeen.add(k); await wait(400); await shot('coach-' + coachSeen.size); }
    await page.mouse.click(c.x, c.y);
    return true;
  };
  const seen = new Set();
  // 한 화면 흐름을 따라간다: 새 말풍선마다 찍고 따라 하기 · until() 이 참이면 끝
  async function run(label, until, maxSec = 240, onIdle) {
    const t0 = Date.now();
    let logAt = 0;
    while (Date.now() - t0 < maxSec * 1000) {
      if (await until()) return true;
      if (process.env.TUT_DEBUG && Date.now() - logAt > 8000) { logAt = Date.now(); console.log(label, JSON.stringify(await page.evaluate(() => { const a = window.__lb.app, g = a.g; return { scr: a.screen, t: g && Math.round(g.t), wave: g && g.wave, cards: a.cardsOpen, paused: a.paused, tut: window.__lb.tut.now(), modal: [...document.querySelectorAll('.info-modal, .confirm-modal, .bload')].map((m) => m.className).join('|') }; }))); }
      const b = await beat();
      if (b && !seen.has(b.txt)) {
        seen.add(b.txt);
        await wait(450); // 말풍선 튀어나오는 연출이 끝나게
        await shot(`${label}-${seen.size}`);
        await follow(b);
        await wait(500);
        continue;
      }
      if (b && seen.has(b.txt)) { await follow(b); await wait(700); continue; } // 같은 말풍선이 남아 있으면 한 번 더
      if (await followCoach()) { await wait(700); continue; }
      if (onIdle) await onIdle();
      await wait(350);
    }
    console.log('timeout', label);
    return false;
  }
  const scr = () => page.evaluate(() => window.__lb.app.screen);
  // 새 판을 열기 전: 남아 있는 창(새 꾸미기 · 알림 받기 · 보상 등)을 닫는다 (사람이 닫듯이)
  const clearModals = async (why) => { const m = await page.evaluate(() => { const out = [...document.querySelectorAll('.info-modal, .confirm-modal')].map((x) => x.className); for (const x of document.querySelectorAll('.info-modal, .confirm-modal')) x.remove(); return out; }); if (m.length) console.log('closed', why, m.join(' / ')); };
  const click = (sel) => page.evaluate((s) => { const b = document.querySelector(s); if (b) b.click(); return !!b; }, sel);
  // 전투: 로딩 넘기기 · 빨리 감기(튜토리얼이 멈출 땐 멈춘다) · 끝나면 결과
  const battleIdle = async () => page.evaluate(() => {
    const bl = document.querySelector('.bload'); if (bl) bl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const a = window.__lb.app; if (a.g && !a.g.over) { a.runSpeed = 3; a.g.base.hp = a.g.base.max; } // 빨리 · 지지 않게 (튜토리얼 배율은 그대로 곱해진다)
    // 안내가 안 떠 있을 때 카드 · 증강은 사람처럼 첫 장을 고른다
    const L = document.querySelector('.tutor'); const free = !L || L.classList.contains('tu-hid');
    if (free && a.cardsOpen) { const c = document.querySelector('#cardstrip [data-act="pick"]'); if (c) c.click(); }
    if (free) { const c = document.querySelector('.aug-box [data-aug]'); if (c) c.click(); }
  });
  async function extra() {
    const startStage = async (deck, st) => { await clearModals('x'); await page.evaluate((d, s0) => { const a = window.__lb.app; a.decks[a.deckI] = d; return window.__lb.startRun(null, s0); }, deck, st); await wait(1500); };
    const has = (id) => page.evaluate((k) => window.__lb.tut.state().includes(k), id);
    await startStage(['gunnyeo', 'gunman', 'bangjang', 'staff', 'wonsik', null], 3);
    await run('s3', async () => (await has('b3')) && (await has('sup')), 300, battleIdle);
    await page.evaluate(() => { const a = window.__lb.app; if (a.g) a.g.over = true; window.__lb.showScreen('menu'); }); await wait(1500);
    await startStage(['baul', 'gunman', 'staff', 'gunnyeo', null, null], 4);
    await run('baul', () => has('baul'), 120, battleIdle);
    await page.evaluate(() => { const a = window.__lb.app; if (a.g) a.g.over = true; window.__lb.showScreen('menu'); }); await wait(1500);
    await clearModals('pvp'); await page.evaluate(() => window.__lb.pvpUi.start(7)); await wait(1500);
    await run('pvp', () => has('pvp'), 60, battleIdle);
    await page.evaluate(() => { const a = window.__lb.app; if (a.g) a.g.over = true; window.__lb.showScreen('menu'); }); await wait(1500);
    await clearModals('tower'); await page.evaluate(() => window.__lb.tower()); await wait(1800);
    await page.evaluate(() => { const b = document.querySelector('.info-modal [data-x]'); if (b) b.click(); }); await wait(600);
    await run('tower', () => has('tower'), 40);
    await wait(1500);
    const me = await page.evaluate(async (t) => (await fetch('/api/langbang/me', { headers: { authorization: 'Bearer ' + t.token } })).json(), acct);
    console.log('server tut', JSON.stringify(me.profile && me.profile.tut));
    console.log('errors', errors.length ? errors : 'none');
    fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify({ shots, errors }, null, 1));
    await browser.close(); process.exit(0);
  }
  if (EXTRA) { await extra(); return; }
  // ── 1) 로비 → 출전 준비 ──
  await run('lobby0', async () => (await scr()) === 'prep', 30);
  await run('prep0', async () => (await scr()) === 'play', 30);
  // ── 2) 1-1 ──
  await run('s1', async () => (await scr()) === 'result', 420, battleIdle);
  await wait(1500); await shot('s1-result');
  console.log('tut after 1-1', await page.evaluate(() => window.__lb.tut.state()));
  await click('[data-act="menu"]'); await wait(2500);
  // ── 3) 첫 클리어 뒤 로비 ──
  await run('lobby1', async () => { const s = await page.evaluate(() => window.__lb.tut.state()); return s.includes('lobby') && !(await beat()); }, 40);
  await run('upg', async () => !(await beat()) && !(await page.$('.coach')), 90); // 추천 강화 → 길 안내(코치)를 끝까지
  await page.evaluate(() => { for (const m of document.querySelectorAll('.info-modal')) m.remove(); window.__lb.showScreen('menu'); }); await wait(1200);
  await shot('lobby1-after');
  // ── 4) 1-2: 출전 준비 안내 → 전투 (스킬 · 찍기 · 총공지) ──
  await clearModals('s2'); await page.evaluate(() => { window.__lb.app.lobbyStage = 2; }); await click('.lb-start'); await wait(1500);
  if ((await scr()) === 'menu') { await click('.lb-start'); await wait(1500); }
  await run('prep2', async () => (await scr()) === 'play', 40);
  await run('s2', async () => (await scr()) === 'result', 420, battleIdle);
  await wait(1200);
  console.log('tut after 1-2', await page.evaluate(() => window.__lb.tut.state()));
  await click('[data-act="menu"]'); await wait(2500);
  // ── 5) 1-3: 별 · 쓰러짐 ──
  await run('lobby2', async () => !(await beat()), 20);
  await clearModals('s3'); await page.evaluate(() => { window.__lb.app.lobbyStage = 3; window.__lb.showScreen('menu'); }); await wait(800); await clearModals('s3b');
  await click('.lb-start'); await wait(1500);
  await run('prep3', async () => (await scr()) === 'play', 8);
  if ((await scr()) === 'prep') { await clearModals('prep3'); await click('.pp-gobtn2'); await wait(1500); }
  await run('s3', async () => (await scr()) === 'result', 420, battleIdle);
  console.log('tut after 1-3', await page.evaluate(() => window.__lb.tut.state()));
  await click('[data-act="menu"]'); await wait(2500);
  await run('lobby3', async () => !(await beat()), 25);
  // ── 6) 처음 보는 것: 송바울 · 1:1 대전 · 탑 ──
  await clearModals('baul'); await page.evaluate(() => { const a = window.__lb.app; a.decks[a.deckI] = ['baul', 'gunman', 'staff', 'gunnyeo', null, null]; return window.__lb.startRun(null, 1); });
  await wait(1500);
  await run('baul', async () => { const s = await page.evaluate(() => window.__lb.tut.state()); return s.includes('baul'); }, 90, battleIdle);
  await page.evaluate(() => { const a = window.__lb.app; if (a.g) { a.g.over = true; } window.__lb.showScreen('menu'); }); await wait(1500);
  await clearModals('pvp'); await page.evaluate(() => window.__lb.pvpUi.start(7)); await wait(1500);
  await run('pvp', async () => { const s = await page.evaluate(() => window.__lb.tut.state()); return s.includes('pvp'); }, 60, battleIdle);
  await page.evaluate(() => { const a = window.__lb.app; if (a.g) { a.g.over = true; } window.__lb.showScreen('menu'); }); await wait(1500);
  await page.evaluate(() => window.__lb.tower()); await wait(1500);
  await page.evaluate(() => { const b = document.querySelector('.info-modal [data-x]'); if (b) b.click(); }); await wait(600);
  await run('tower', async () => { const s = await page.evaluate(() => window.__lb.tut.state()); return s.includes('tower'); }, 30);
  // ── 7) 다시 보기 (설정) + 움직임 줄이기 ──
  await page.evaluate(() => window.__lb.showScreen('menu')); await wait(1200);
  await click('.lb-quick [data-act="settings"]'); await wait(800);
  await page.evaluate(() => { const b = document.querySelector('[data-act="tutReplay"]'); if (b) b.scrollIntoView({ block: 'center' }); }); await wait(300);
  await shot('settings-replay');
  await click('[data-act="tutReplay"]'); await wait(1500);
  await page.evaluate(() => document.body.classList.add('rm')); await wait(600);
  await shot('replay-rm');
  console.log('final state', await page.evaluate(() => window.__lb.tut.state()));
  console.log('errors', errors.length ? errors : 'none');
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify({ shots, errors }, null, 1));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
