'use strict';
// 실제 브라우저(에지/크롬)로 휴대폰 3대를 흉내 내서 한 판을 끝까지 플레이하는 검증 스크립트
//   node scripts/e2e.js [스크린샷폴더]
// 필요: puppeteer-core (개발용), 에지 또는 크롬 설치
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../server/index');

const OUT = process.argv[2] || path.join(__dirname, '..', 'e2e-shots');
fs.mkdirSync(OUT, { recursive: true });
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('•', ...a);
let failures = 0;
function check(cond, msg) {
  if (cond) log('통과:', msg);
  else { failures++; console.log('✖ 실패:', msg); }
}

(async () => {
  const srv = createServer({ port: 0 });
  const port = await srv.listen();
  const base = `http://localhost:${port}`;
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--mute-audio'] });
  const errors = [];

  async function phone(name) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|webp|404/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
    page.on('dialog', (d) => d.accept());
    page.nm = name;
    return page;
  }
  const shot = (page, file) => page.screenshot({ path: path.join(OUT, file) });
  const state = (page) => page.evaluate(() => window.__chandem && window.__chandem.S.state);

  // 1) 방장: 방 만들기
  const A = await phone('방장');
  await A.goto(base, { waitUntil: 'networkidle0' });
  await shot(A, '01-home.png');
  await A.click('[data-game="holdem"]'); // 게임 선택 → 홀덤 입장 화면
  await A.waitForSelector('#go-create');
  await A.click('#go-create');
  await A.waitForSelector('#create-form');
  await A.type('input[name=name]', '찬');
  await A.$eval('input[name=startChips]', (e) => { e.value = '1000'; });
  await shot(A, '02-create.png');
  await A.click('#create-form button[type=submit]');
  await A.waitForSelector('.invite');
  const inviteText = await A.$eval('.invite-url', (e) => e.textContent.trim());
  const code = inviteText.split('/r/')[1];
  check(/^[A-Z0-9]{6}$/.test(code), `초대 링크 생성 (${inviteText})`);
  const qrOk = await A.$eval('img.qr', (img) => new Promise((res) => { if (img.complete) res(img.naturalWidth > 0); else img.onload = () => res(img.naturalWidth > 0); }));
  check(qrOk, 'QR코드 이미지가 표시됨');

  // 2) 친구 2명: 초대 링크로 참가 (같은 닉네임 포함)
  const B = await phone('친구1');
  const C = await phone('친구2');
  for (const [p, nm] of [[B, '민수'], [C, '민수']]) {
    await p.goto(`${base}/r/${code}`, { waitUntil: 'networkidle0' });
    await p.waitForSelector('#join-form');
    await p.type('#join-form input[name=name]', nm);
    await p.click('#join-form button[type=submit]');
    await p.waitForSelector('#ready');
  }
  await shot(B, '03-join-lobby.png');
  const names = (await state(A)).players.map((p) => p.name).sort();
  check(JSON.stringify(names) === JSON.stringify(['민수', '민수 (2)', '찬']), `중복 닉네임 구분: ${names.join(', ')}`);
  const startDisabled = await A.$eval('#start', (b) => b.disabled);
  check(startDisabled, '준비 전에는 시작 버튼이 막혀 있음');
  await B.click('#ready');
  await C.click('#ready');
  await A.waitForFunction(() => !document.querySelector('#start').disabled);
  await shot(A, '04-lobby-ready.png');

  // 3) 게임 시작
  await A.click('#start');
  for (const p of [A, B, C]) await p.waitForSelector('.board');
  await wait(800);
  await shot(A, '05-table-start.png');

  // 비공개 정보 확인: 각자 브라우저가 받은 데이터에 남의 카드가 없음
  for (const p of [A, B, C]) {
    const st = await state(p);
    const others = st.players.filter((x) => x.id !== st.me.id && x.cards);
    check(others.every((x) => x.cards.every((c) => c === '??')), `${p.nm}: 남의 카드는 숨겨져 옴`);
  }

  // 4) 한 판 끝까지: 차례인 사람이 체크/콜 (한 번은 레이즈 화면도 확인)
  let raisedShot = false;
  for (let i = 0; i < 40; i++) {
    const st = await state(A);
    if (st.hand && st.hand.finished) break;
    let acted = false;
    for (const p of [A, B, C]) {
      const btn = await p.$('#g-actions [data-act="check"]') || await p.$('#g-actions [data-act="call"]');
      if (!btn) continue;
      if (!raisedShot) {
        const r = await p.$('#g-actions [data-act="raise"]:not([disabled])');
        if (r) {
          await shot(p, '06-my-turn.png');
          await r.click();
          await p.waitForSelector('#raise-range');
          await shot(p, '07-raise-sheet.png');
          await p.click('#raise-cancel');
          await p.waitForSelector('#g-actions [data-act]');
          raisedShot = true;
        }
      }
      const b2 = await p.$('#g-actions [data-act="check"]') || await p.$('#g-actions [data-act="call"]');
      await b2.click();
      acted = true;
      await wait(350);
      break;
    }
    if (!acted) await wait(200);
  }
  await A.waitForSelector('.result', { timeout: 15000 });
  await wait(700);
  await shot(A, '08-showdown.png');
  const res = (await state(A)).hand.result;
  check(res && res.type === 'showdown' && (await state(A)).hand.board.length === 5, `쇼다운까지 진행: ${res.winnerNames.join(', ')} · ${Object.values(res.hands)[0] && res.hands[res.winners[0]].name}`);
  const sum = Object.values(res.deltas).reduce((a, b) => a + b, 0);
  check(sum === 0, '칩 증감 합계 0');

  // 5) 족보표
  await B.click('#chart-btn');
  await B.waitForSelector('.chart-list');
  await shot(B, '09-hand-chart.png');
  await B.click('.modal [data-close]');

  // 6) 다음 판 시작 후 새로고침 → 같은 사람, 같은 카드
  await A.waitForFunction(() => window.__chandem.S.state.room.handNo === 2 && !window.__chandem.S.state.hand.finished, { timeout: 30000 });
  await wait(500);
  const before = await state(B);
  const myCardsBefore = before.players.find((p) => p.id === before.me.id).cards;
  await B.reload({ waitUntil: 'networkidle0' });
  await B.waitForSelector('.board');
  await wait(400);
  const after = await state(B);
  const myCardsAfter = after.players.find((p) => p.id === after.me.id).cards;
  check(after.me.id === before.me.id && JSON.stringify(myCardsAfter) === JSON.stringify(myCardsBefore), `새로고침 후 같은 플레이어·같은 카드로 복구 (${myCardsAfter.join(' ')})`);
  await shot(B, '10-after-reload.png');

  // 7) 폴드로 끝나는 판: 차례인 사람 둘이 폴드
  for (let i = 0; i < 6; i++) {
    const st = await state(A);
    if (st.hand.finished) break;
    for (const p of [A, B, C]) {
      const f = await p.$('#g-actions [data-act="fold"]:not([disabled])');
      const ck = await p.$('#g-actions [data-act="check"]');
      if (f) { await f.click(); await wait(350); break; }
      if (ck) { await ck.click(); await wait(350); break; }
    }
  }
  await A.waitForSelector('.result', { timeout: 15000 }).catch(() => {});
  await shot(A, '11-fold-win.png');

  // 8) 메뉴
  await A.click('#menu-btn');
  await A.waitForSelector('.modal .invite');
  await shot(A, '12-menu.png');
  await A.click('.modal [data-close]');

  // 9) 데스크톱 크기
  await C.setViewport({ width: 1280, height: 800 });
  await wait(500);
  await shot(C, '13-desktop.png');

  // 10) 음성 파일이 브라우저에서 정상 재생 가능한지(디코딩)
  const audio = await A.evaluate(async () => {
    const m = await (await fetch('/sounds/manifest.json')).json();
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const out = [];
    for (const [k, f] of Object.entries(m)) {
      const buf = await ctx.decodeAudioData(await (await fetch('/sounds/' + f)).arrayBuffer());
      out.push(`${k} ${buf.duration.toFixed(2)}초`);
    }
    return out;
  });
  check(audio.length === 26, `음성 22개 + 배경음악 4곡 디코딩: ${audio.join(', ')}`);
  const imgs = await A.evaluate(async () => {
    const list = ['/img/gw-icon-192.png', '/img/emblem.webp', '/img/bg-lobby.webp', '/img/felt.webp', ...Array.from({ length: 8 }, (_, i) => `/img/avatars/a${i + 1}.webp`)];
    const res = await Promise.all(list.map((u) => fetch(u).then((r) => r.ok)));
    return res.every(Boolean);
  });
  check(imgs, '이미지 에셋 12개 모두 로드');

  // 11) 배경음악: 첫 터치 이후 반복 재생, 소리 설정에서 끄면 멈춤
  await wait(1500);
  const music = await A.evaluate(() => window.__chandem.sound.musicState());
  check(music && music.playing, `배경음악 재생 중 (${music && music.src.split('/').pop()})`);
  await A.evaluate(() => window.__chandem.sound.setMusic(false));
  const off = await A.evaluate(() => window.__chandem.sound.musicState());
  check(off && !off.playing, '배경음악 끄기');
  await A.evaluate(() => window.__chandem.sound.setMusic(true));

  // 12) 링크 미리보기: 초대 링크에 방장 이름이 들어간 제목 + 미리보기 이미지
  const og = await (await fetch(`${base}/r/${code}`)).text();
  const ogTitle = (og.match(/og:title" content="([^"]*)/) || [])[1];
  const ogImg = (og.match(/og:image" content="([^"]*)/) || [])[1];
  const ogUrl = (og.match(/og:url" content="([^"]*)/) || [])[1];
  check(ogTitle && ogTitle.includes('찬님이') && /og-holdem\.jpg$/.test(ogImg), `미리보기 제목: ${ogTitle} · 사진 ${ogImg && ogImg.split('/').pop()}`);
  check(ogUrl && ogUrl.endsWith(`/r/${code}`), `미리보기 주소가 방 주소 (카카오 캐시 분리): ${ogUrl}`);
  check((await fetch(new URL(ogImg).pathname.replace(/^/, base))).ok, '미리보기 이미지 로드');

  check(errors.length === 0, `브라우저 오류 없음${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
  await srv.close();
  console.log(failures ? `\n실패 ${failures}건` : '\n모든 브라우저 검증 통과');
  console.log(`스크린샷: ${OUT}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
