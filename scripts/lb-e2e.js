'use strict';
// 랑방 대전 브라우저 검증: 레벨업 카드가 떠 있을 때 뒤로/일시정지 → 확인창이 맨 위 · 취소하면 카드 그대로 · 멈춘 동안 자동 선택 안 됨
//   node scripts/lb-e2e.js
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(cond, msg) {
  if (cond) console.log('• 통과:', msg);
  else { failures++; console.log('✖ 실패:', msg); }
}
// 요소 가운데 점에서 맨 위에 있는 요소가 그 요소(안쪽)인가
const topAt = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && (hit === el || el.contains(hit));
}, sel);

(async () => {
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--mute-audio'] });
  const errors = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(e.message));
  const base = `http://localhost:${port}/langbang/`;
  await page.goto(base + '?nogate', { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.setItem('langbang:guest', JSON.stringify({ stages: { 1: 3, 2: 3, 3: 3, 4: 3 }, heroes: {} })); });
  await page.goto(base + '?stage=1-5&god', { waitUntil: 'networkidle0' });
  await wait(2500);
  // 카드 열기
  await page.evaluate(() => { const L = window.__lb; L.g.augOffer = null; L.g.pendingLevels = 2; L.openCards(); });
  await wait(700);
  check(await topAt(page, '#cardstrip .card[data-i="0"]'), '카드가 떠 있고 누를 수 있다');
  // 일시정지 (뒤로 가기와 같은 길)
  await page.evaluate(() => document.getElementById('btn-pause').click());
  await wait(400);
  check(await topAt(page, '.pause-box [data-act="resume"]'), '일시정지 화면이 카드 위에 있다');
  // 멈춘 동안 자동 선택 시계가 멈춘다
  await page.evaluate(() => { window.__lb.app.cardAutoT = 0.4; });
  await wait(1200);
  check(await page.evaluate(() => window.__lb.app.cardsOpen && window.__lb.app.cardAutoT > 0.3), '멈춘 동안 카드 자동 선택 안 됨');
  // 그만두기 → 확인창이 맨 위
  await page.evaluate(() => document.querySelector('.pause-box [data-act="quit"]').click());
  await wait(400);
  check(await topAt(page, '.confirm-modal .confirm-box'), '그만두기 확인창이 맨 위');
  check(await topAt(page, '.confirm-modal [data-c="no"]'), '취소 버튼을 누를 수 있다');
  await page.evaluate(() => document.querySelector('.confirm-modal [data-c="no"]').click());
  await wait(300);
  // 뒤로 가기 → 확인창
  await page.evaluate(() => history.back());
  await wait(600);
  check(await topAt(page, '.confirm-modal .confirm-box'), '뒤로 가기 확인창도 맨 위');
  await page.evaluate(() => { const b = document.querySelector('.confirm-modal [data-c="no"]'); if (b) b.click(); });
  await wait(300);
  // 계속하기 → 카드 그대로 · 고를 수 있다
  await page.evaluate(() => { const b = document.querySelector('.pause-box [data-act="resume"]'); if (b) b.click(); });
  await wait(500);
  check(await page.evaluate(() => window.__lb.app.cardsOpen), '다시 하면 카드가 그대로 있다');
  check(await topAt(page, '#cardstrip .card[data-i="0"]'), '카드를 다시 누를 수 있다');
  const before = await page.evaluate(() => window.__lb.g.pickN | 0); // 고른 카드 수 (그 사이 레벨업이 또 와도 안 흔들림)
  await page.evaluate(() => { window.__lb.app.cardLockUntil = 0; document.querySelector('#cardstrip .card[data-i="0"]').click(); });
  await wait(600);
  check(await page.evaluate((b) => (window.__lb.g.pickN | 0) === b + 1, before), '카드를 고르면 한 장이 적용된다');
  // 다시 켜진 뒤엔 자동 선택 시계가 흐른다
  await page.evaluate(() => { window.__lb.app.cardAutoT = 0.3; });
  let auto = false;
  for (let i = 0; i < 40 && !auto; i++) { await wait(100); auto = await page.evaluate(() => !window.__lb.app.cardsOpen || window.__lb.app.cardAutoT > 5); }
  check(auto, '다시 흐르면 자동 선택된다');
  // 우편함: 보상(장비 등급 글자 · 신화 포함)이 쌓여 있어도 눌러서 열리고 · 모두 받기
  await page.evaluate(() => { const now = Date.now(); const g = JSON.parse(localStorage.getItem('langbang:guest') || '{}'); g.mailSeq = 3; g.mail = [{ id: 1, title: '무한 주간', text: '1위', rw: { coins: 500, gear: 'myth' }, at: now, exp: now + 6e8 }, { id: 2, title: '레이드', text: '참가', rw: { gear: 'legend', stones: 2 }, at: now, exp: now + 6e8 }, { id: 3, title: '시즌', text: '단계', rw: { tickets: 1 }, at: now, exp: now + 6e8 }]; localStorage.setItem('langbang:guest', JSON.stringify(g)); localStorage.removeItem('langbang:snap'); });
  await page.goto(base + '?nogate', { waitUntil: 'networkidle0' });
  await wait(900);
  check(await topAt(page, '[data-act="mail"]'), '로비 우편 버튼을 누를 수 있다');
  await page.tap('[data-act="mail"]');
  await wait(900);
  check(await page.evaluate(() => document.querySelectorAll('.mail-pop .mail-row').length === 3), '우편함이 열리고 우편 3개');
  await page.evaluate(() => document.querySelector('.mail-pop [data-act="mailGet"][data-id="all"]').click());
  await wait(1000);
  check(await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('langbang:guest')); return (g.mail || []).length === 0 && (g.gear || []).some((x) => x.r === 'myth'); }), '모두 받기 → 우편 0 · 신화 장비 받음');
  // 뒤로 가기: 상점 → 아이템 설명 → 뒤로(설명 닫힘) → 뒤로(로비) → 뒤로(나가기 확인) → 취소(그대로)
  await page.goto(base + '?nogate', { waitUntil: 'networkidle0' });
  await wait(900);
  await page.tap('[data-act="nav"][data-tab="shop"]'); await wait(500);
  await page.evaluate(() => { const b = document.querySelector('[data-act="shopTab"][data-tab="items"]'); if (b) b.click(); }); await wait(400);
  await page.tap('.up.item [data-act="itemInfo"]'); await wait(500);
  check(await page.evaluate(() => !!document.querySelector('.info-modal')), '아이템 설명이 열린다');
  const back = async () => { await page.evaluate(() => history.back()); await wait(600); };
  await back();
  check(await page.evaluate(() => !document.querySelector('.info-modal') && window.__lb.app.screen === 'shop'), '뒤로: 설명만 닫히고 상점 그대로');
  await back();
  check(await page.evaluate(() => window.__lb.app.screen === 'menu' && location.pathname.startsWith('/langbang')), '뒤로: 로비로 (게임월드로 안 나감)');
  await back();
  check(await page.evaluate(() => !!document.querySelector('.confirm-modal') && location.pathname.startsWith('/langbang')), '로비에서 뒤로: 나가기 확인창');
  await page.evaluate(() => document.querySelector('.confirm-modal [data-c="no"]').click()); await wait(400);
  check(await page.evaluate(() => !document.querySelector('.confirm-modal') && window.__lb.app.screen === 'menu' && location.pathname.startsWith('/langbang')), '취소하면 그대로 로비');
  await back();
  check(await page.evaluate(() => !!document.querySelector('.confirm-modal') && location.pathname.startsWith('/langbang')), '한 번 더 뒤로도 확인창 (게임월드로 안 샘)');
  await page.evaluate(() => document.querySelector('.confirm-modal [data-c="no"]').click()); await wait(400);
  await page.tap('[data-act="nav"][data-tab="shop"]'); await wait(400);
  await page.tap('[data-act="nav"][data-tab="bag"]'); await wait(400);
  await back();
  check(await page.evaluate(() => window.__lb.app.screen === 'shop'), '장비 → 뒤로: 바로 전 화면(상점)');
  // 뒤로 가기로 타이틀(게이트)에 가지 않기: 게이트 → 로비 → 도감 → 뒤로×3 · 로비 → 장비 → 멤버 상세 → 뒤로×3 · 새로고침
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(base, { waitUntil: 'networkidle0' }); await wait(3600);
  check(await page.evaluate(() => !!document.querySelector('.gate')), '처음엔 타이틀이 보인다');
  await page.evaluate(() => document.querySelector('.gate').click()); await wait(700);
  const noGate = () => page.evaluate(() => !document.querySelector('.gate') && location.pathname.startsWith('/langbang'));
  const closeConfirm = () => page.evaluate(() => { const b = document.querySelector('.confirm-modal [data-c="no"]'); if (b) b.click(); });
  await page.evaluate(() => document.querySelector('[data-act="dex"]').click()); await wait(600);
  let ok1 = true;
  for (let k = 0; k < 3; k++) { await page.evaluate(() => history.back()); await wait(600); ok1 = ok1 && (await noGate()); await closeConfirm(); await wait(200); }
  check(ok1, '도감에서 뒤로×3: 타이틀로 안 감 · 랑방에 남음');
  await page.tap('[data-act="nav"][data-tab="bag"]'); await wait(600);
  await page.evaluate(() => { const c = document.querySelector('[data-act="heroInfo"], .eqh, [data-act="bagHeroPick"]'); if (c) c.click(); }); await wait(600);
  let ok2 = true;
  for (let k = 0; k < 3; k++) { await page.evaluate(() => history.back()); await wait(600); ok2 = ok2 && (await noGate()); await closeConfirm(); await wait(200); }
  check(ok2, '장비 → 멤버 → 뒤로×3: 타이틀로 안 감 · 랑방에 남음');
  await page.reload({ waitUntil: 'networkidle0' }); await wait(1200);
  check(await noGate(), '새로고침해도 (같은 세션) 타이틀 없이 바로 로비');
  let ok3 = true;
  for (let k = 0; k < 10; k++) { await page.evaluate(() => history.back()); await wait(350); ok3 = ok3 && (await noGate()); await closeConfirm(); await wait(150); }
  check(ok3, '뒤로 10번 연타: 확인 없이 랑방을 떠나지 않음');
  // 덱 끌어다 놓기: 목록 → 1번 칸 = 대장 · 칸 → 밖 = 빼기
  await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('langbang:guest') || '{}'); g.stages = Object.assign(g.stages || {}, { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 3, 11: 3 }); g.maxStage = 11; localStorage.setItem('langbang:guest', JSON.stringify(g)); localStorage.setItem('langbang:decks', JSON.stringify({ i: 0, decks: [['staff', 'gunman', null, null, null, null], [], []] })); localStorage.removeItem('langbang:deckOrder'); localStorage.removeItem('langbang:leaders'); });
  await page.goto(base + '?nogate', { waitUntil: 'networkidle0' }); await wait(800);
  await page.tap('[data-act="nav"][data-tab="deck"]'); await wait(700);
  const drag = async (fromSel, toSel) => { const a = await page.$eval(fromSel, (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); const b = toSel ? await page.$eval(toSel, (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }) : [a[0], 30]; await page.mouse.move(a[0], a[1]); await page.mouse.down(); await wait(200); for (let k = 1; k <= 10; k++) { await page.mouse.move(a[0] + ((b[0] - a[0]) * k) / 10, a[1] + ((b[1] - a[1]) * k) / 10); await wait(20); } await page.mouse.up(); await wait(600); };
  const lead0 = await page.evaluate(() => document.querySelector('.dk-slots [data-dslot="0"] .acard').dataset.id);
  const pick = await page.evaluate(() => { const inDeck = new Set([...document.querySelectorAll('.dk-slots .acard')].map((e) => e.dataset.id)); const c = [...document.querySelectorAll('.agrid .acard[data-id]:not(.locked)')].find((e) => !inDeck.has(e.dataset.id) && e.getBoundingClientRect().top < innerHeight - 90 && e.getBoundingClientRect().top > 0); if (!c) { const c2 = [...document.querySelectorAll('.agrid .acard[data-id]:not(.locked)')].find((e) => !inDeck.has(e.dataset.id)); const sc = document.querySelector('#ui > .screen'); sc.scrollTop += c2.getBoundingClientRect().top - (innerHeight - 170); return c2.dataset.id; } return c.dataset.id; });
  await wait(300);
  await drag(`.agrid .acard[data-id="${pick}"]`, '.dk-slots [data-dslot="0"]');
  check(await page.evaluate((id) => { const c = document.querySelector('.dk-slots [data-dslot="0"] .acard'); return c && c.dataset.id === id; }, pick), `목록에서 1번 칸에 놓으면 대장 (전: ${lead0})`);
  await page.evaluate(() => { document.querySelector('#ui > .screen').scrollTop = 0; }); await wait(300);
  const nBefore = await page.evaluate(() => document.querySelectorAll('.dk-slots [data-dslot] .acard').length);
  await drag('.dk-slots [data-dslot="1"] .acard', null);
  check(await page.evaluate((n) => document.querySelectorAll('.dk-slots [data-dslot] .acard').length === n - 1, nBefore), '칸 밖으로 끌면 빠진다');
  check(!errors.length, '페이지 에러 없음' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  await srv.close();
  console.log(failures ? `✖ ${failures}개 실패` : '랑방 브라우저 검증 통과');
  process.exit(failures ? 1 : 0);
})();
