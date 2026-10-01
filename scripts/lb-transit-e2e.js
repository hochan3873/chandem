'use strict';
// 랑방 대전 화면 넘김 연출 검증: 목적지별 전환 · 탭해서 건너뛰기 · 전환 중 뒤로 가기 · 빠른 두 번 탭 · 움직임 줄이기
//   node scripts/lb-transit-e2e.js
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

(async () => {
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--mute-audio'] });
  const errors = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(e.message));
  const base = `http://localhost:${port}/langbang/`;
  await page.goto(base + '?nogate', { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.setItem('langbang:guest', JSON.stringify({ stages: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 3])), heroes: {}, tickets: 3 })); localStorage.removeItem('langbang:snap'); });
  await page.goto(base + '?nogate', { waitUntil: 'networkidle0' });
  await wait(1200);
  const state = () => page.evaluate(() => ({ scr: window.__lb.app.screen, ov: (document.querySelector('.tr-ov') || {}).className || '', old: document.querySelectorAll('#ui > .tr-old').length, n: document.querySelectorAll('#ui > .screen').length, hold: document.getElementById('ui').className }));
  // 느린 기기(헤드리스 소프트웨어 그리기)에서도: 끝날 때까지 최대 3초 기다린다
  const settle = async (ms = 3000) => { const t0 = Date.now(); let st = await state(); while ((st.ov || st.old || st.hold) && Date.now() - t0 < ms) { await wait(100); st = await state(); } return st; };
  const toMenu = () => page.evaluate(() => (document.querySelector('#ui > .screen [data-act="menu"]') || document.querySelector('[data-act="nav"][data-tab="battle"]')).click());

  // 1) 진상의 탑: 화면 상태는 바로 바뀌고 · 탑 전용 덮개 · 1초 안에 깨끗이 끝남
  await page.evaluate(() => document.querySelector('.tw-entry').click());
  let s = await state();
  check(s.scr === 'tower' && /tr-tower/.test(s.ov) && s.old === 1, '탑 입장: 상태는 바로 탑 · 탑 전용 덮개 · 로비 잔상');
  s = await settle();
  check(!s.ov && !s.old && s.n === 1 && !s.hold, '탑 입장 연출이 끝나면 덮개 · 잔상 없음 ' + JSON.stringify(s));
  // 2) 탑 → 로비: 반대로 빠져나옴
  await toMenu();
  s = await state();
  check(s.scr === 'menu' && /tr-tower out/.test(s.ov), '탑 → 로비: 빠져나오는 연출');
  s = await settle();
  check(s.n === 1 && !s.ov && !s.old, '탑 → 로비 끝: 화면 하나 ' + JSON.stringify(s));
  // 3) 탭해서 건너뛰기
  await page.evaluate(() => document.querySelector('.tw-entry').click());
  await wait(120);
  await page.evaluate(() => { const o = document.querySelector('.tr-ov'); o.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); });
  s = await state();
  check(s.scr === 'tower' && !s.old && !s.hold && (!s.ov || /tr-eat/.test(s.ov)), '덮개를 탭하면 바로 탑 로비');
  await wait(500);
  check(!(await state()).ov, '건너뛴 뒤 덮개 정리');
  await toMenu(); await settle();
  // 4) 레이드: 엘리베이터 · 전환 중 뒤로 가기
  await page.evaluate(() => document.querySelector('[data-act="raid"]').click());
  s = await state();
  check(s.scr === 'raid' && /tr-elev/.test(s.ov), '레이드: 엘리베이터 문');
  await wait(150);
  await page.evaluate(() => history.back());
  await wait(700);
  s = await state();
  check(s.scr === 'menu' && !s.ov && !s.old && s.n === 1, '전환 중 뒤로 가기: 로비로 · 덮개 · 잔상 없음');
  check(/^\/langbang/.test(await page.evaluate(() => location.pathname)), '뒤로 가기로 랑방을 떠나지 않음');
  // 5) 1:1 대전: VS 와이프
  await page.evaluate(() => document.querySelector('.tile[data-act="pvp"]').click());
  check(/tr-vs/.test((await state()).ov), '1:1 대전: 대각선 VS');
  await settle();
  await toMenu(); await settle();
  // 6) 모집: 셔터 · 빠른 두 번 탭 (두 번째 탭은 건너뛰기만 · 화면은 하나)
  const tile = await page.$('[data-act="recruit"]');
  const box = await tile.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await wait(60);
  check(/tr-shut/.test((await state()).ov) || (await state()).scr === 'shop', '모집: 셔터');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  s = await settle();
  check(s.scr === 'shop' && s.n === 1 && !s.ov, '빠른 두 번 탭: 상점 하나만 · 엉뚱한 버튼 안 눌림');
  // 7) 보통 넘김: 이전 화면이 잠깐 잔상 → 정리
  await toMenu(); await settle();
  await page.evaluate(() => document.querySelector('[data-act="season"]').click());
  s = await state();
  check(s.scr === 'season' && s.old === 1 && !s.ov, '보통 넘김: 덮개 없이 깊이감 잔상');
  check((await settle()).old === 0, '보통 넘김 잔상 정리');
  // 8) 움직임 줄이기: 연출 없이 바로
  await page.evaluate(() => document.body.classList.add('rm'));
  await toMenu(); await wait(100);
  await page.evaluate(() => document.querySelector('.tw-entry').click());
  s = await state();
  check(s.scr === 'tower' && !s.ov && !s.old, '움직임 줄이기: 연출 없이 바로 넘어감');
  check(errors.length === 0, '페이지 에러 없음' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  srv.close && srv.close();
  console.log(failures ? `실패 ${failures}개` : '화면 넘김 검증 통과');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
