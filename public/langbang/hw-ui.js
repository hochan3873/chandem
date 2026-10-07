// 랑방 대전 — 할로윈 이벤트 「할로윈 저주의 밤」 화면
//  로비 배너 · 이벤트 지도(10 스테이지) · 출전 준비(출전 제한 확인 · 추천 · 대여) · 저주 고르기 · 결과 · 사탕 상점 · 의상실 · 랭킹 · 인트로
//  game.js 가 initHw(도우미) 로 부르고 돌려받은 함수들을 화면 곳곳에 끼운다 (진상의 탑과 같은 틀)
import { HEROES, ENEMIES, ATTRS, KD_SUP, HERO_ROLE, HERO_ROLES, enemySkills, EST, heroTier, TIER_NAME } from './data.js';
import * as HW from './hw-event.js';
import * as HWS from './hw-sim.js';
import { drawHw, hwEvent, resetHwFx } from './hw-fx.js';

let C = null;
const st = { n: 0, decks: {}, rent: {}, curses: {}, board: null, boardAt: 0, run: null, last: null };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 무시 */ } };
const P = () => C.P();
const own = (h) => C.API.heroUnlocked(P(), h);
const candyIc = (cls = '') => `<img class="hw-candy ${cls}" src="${HW.CANDY_ART}" alt="" draggable="false" onerror="this.replaceWith(document.createTextNode('🍬'))">`;
const hwOf = () => (P().hw && P().hw.id === HW.HW.id ? P().hw : HW.emptyHw());
const daysLeft = () => { const now = Date.now(), t = new Date(now + 9 * 3600e3); const end = Date.UTC(t.getUTCFullYear(), 10, 3) - 9 * 3600e3; return Math.max(0, Math.ceil((end - now) / 86400e3)); };
const INTRO = { video: '/img/lb/hw/intro.mp4', poster: '/img/lb/hw/intro_poster.webp', key: 'langbang:hwIntro:' + HW.HW.id };
const KEYART = '/img/lb/hw/hw_key.webp';
const ruleChip = (r, ok) => `<span class="hw-rule ${ok === undefined ? '' : ok ? 'ok' : 'no'}"><i>${esc(HW.RULES[r].icon)}</i>${esc(HW.RULES[r].name)}${ok === undefined ? '' : ok ? '<b>✓</b>' : '<b>!</b>'}</span>`;

export function initHw(ctx) {
  C = ctx;
  C.R.hwDraw = (g, t, layer) => drawHw(C.R, g, t, layer);
  try { applySkins(); } catch { /* 프로필 전 */ }
  return { show: showHub, prep: showPrep, acts: ACTS, lobbyBanner, modeCard, gameOpt, afterCreate, ensureArt, onEvent, result, heroSkinHtml, applySkins, isEvent: (t) => typeof t === 'string' && t.startsWith('hw'), costumeOf: (id) => HW.wornMap(P() || {})[id] || null, costumeFace: (id) => { const c = HW.wornMap(P() || {})[id]; return (c && HW.COSTUMES[c].face) || null; }, tint, dexSrc, open: () => HW.hwOpen(P()), season: () => HW.hwSeason() };
}

// ─── 의상: 입은 멤버의 그림을 바꿔 끼운다 (전투 · 로비 · 도감) — 그림이 없으면 원래 그림 ───
const SKIN_IMG = {}; // id → { img, attack } Image
function applySkins() {
  const R = C.R, worn = HW.wornMap(P() || {});
  R.skinMap = worn;
  for (const id of Object.keys(HEROES)) {
    const cid = worn[id];
    const keyH = 'h_' + id, keyA = 'hanim_' + id;
    if (!R._skinOrig) R._skinOrig = {};
    if (!R._skinOrig[keyH] && R.images[keyH]) R._skinOrig[keyH] = R.images[keyH];
    if (!R._skinOrig[keyA] && R.images[keyA]) R._skinOrig[keyA] = R.images[keyA];
    if (cid) {
      const art = HW.costumeArt(cid);
      const s = SKIN_IMG[cid] || (SKIN_IMG[cid] = {});
      if (!s.img) { s.img = new Image(); s.img.decoding = 'async'; s.img.onload = () => { if (R.skinMap[id] === cid) { R.images[keyH] = s.img; R.bakeSprite(keyH); } }; s.img.src = art.img; }
      if (!s.atk) { s.atk = new Image(); s.atk.decoding = 'async'; s.atk.onload = () => { if (R.skinMap[id] === cid) R.images[keyA] = s.atk; }; s.atk.src = art.attack; }
      if (s.img.complete && s.img.naturalWidth) { R.images[keyH] = s.img; R.bakeSprite(keyH); }
      if (s.atk.complete && s.atk.naturalWidth) R.images[keyA] = s.atk;
    } else if (R._skinOrig[keyH] && R.images[keyH] !== R._skinOrig[keyH]) {
      R.images[keyH] = R._skinOrig[keyH]; R.images[keyA] = R._skinOrig[keyA]; R.bakeSprite(keyH);
    }
  }
}
// 의상 입은 멤버의 투사체 색 (render · kitfx)
export function tint(id) { const cid = HW.wornMap(P() || {})[id]; return cid ? HW.COSTUMES[cid] : null; }
// 도감 · 썸네일 그림 (의상 입었으면 의상 그림)
function dexSrc(id, kind) { const cid = HW.wornMap(P() || {})[id]; if (!cid) return null; const a = HW.costumeArt(cid); return kind === 'thumb' ? a.thumb : kind === 'hq' ? a.hq : kind === 'dex' ? a.dex : a.img; }

// ─── 로비 배너 · 도전 창 카드 ───
function lobbyBanner(p) {
  if (!HW.hwSeason()) return '';
  const open = HW.hwOpen(p), h = hwOf();
  const fresh = open && !lsGet(INTRO.key);
  return `<button class="hw-banner ${open ? '' : 'locked'}" data-act="hw" aria-label="할로윈 이벤트"><i class="hb-glow"></i><span class="hb-pump"></span><span class="hb-txt"><b>할로윈 저주의 밤</b><small>${open ? `${candyIc('xs')}${fmt(h.candy | 0)} · ${daysLeft()}일 남음` : `${Math.ceil(HW.HW.unlock / 10)}-10 클리어하면 열림`}</small></span>${fresh ? '<i class="rd"></i>' : ''}</button>`;
}
function modeCard(p) {
  if (!HW.hwSeason()) return '';
  const open = HW.hwOpen(p), h = hwOf();
  return `<button class="hw-entry ${open ? '' : 'locked'}" data-act="hw"><i class="he-bats"></i><span class="he-ico"></span><span class="he-txt"><b>할로윈 저주의 밤</b><small>${open ? `이벤트 · ${Object.keys(h.best).length}/${HW.STAGE_COUNT} 클리어 · 점수 ${fmt(h.score | 0)}` : `${Math.ceil(HW.HW.unlock / 10)}-10 클리어하면 열려요`}</small></span><em>${daysLeft()}일</em></button>`;
}

// ─── 이벤트 지도 ───
function showHub(noIntro) {
  const p = P();
  if (!HW.hwSeason()) { C.toast('할로윈 이벤트 기간이 아니에요 (10/10 ~ 11/2)', 2400); return; }
  if (!HW.hwOpen(p)) { C.toast(`할로윈 이벤트는 ${Math.ceil(HW.HW.unlock / 10)}-10 을 깨면 열려요`, 2400); return; }
  if (!noIntro && !lsGet(INTRO.key)) { playIntro(() => showHub(true)); return; }
  const app = C.app;
  app.screen = 'hw';
  app.g = null; app.demo = null; app.paused = false;
  C.hud.hidden = true;
  if (C.A.setMode) C.A.setMode('halloween');
  C.A.setBoss(false);
  if (app.touched) C.A.playBgm();
  renderHub();
  loadBoard();
}
function renderHub() {
  const h = hwOf(), mx = HW.maxOpen(P());
  const nodes = HW.STAGES.map((s) => {
    const b = h.best[s.n], open = s.n <= mx || P().master;
    const ens = [...new Set(s.mix.map((m) => m[0]))].slice(0, 3);
    return `<button class="hw-node ${b ? 'done' : ''} ${open ? '' : 'lock'} ${s.boss ? 'boss' : s.mid ? 'mid' : ''} m-${s.map}" data-act="hwPrep" data-n="${s.n}">
      <em class="hn-no">${s.n}</em>
      <span class="hn-body"><b>${esc(s.name)}</b><span class="hn-rules">${s.rules.map((r) => `<i title="${esc(HW.RULES[r].name)}">${esc(HW.RULES[r].icon)}</i>`).join('')}<small>${s.rules.map((r) => esc(HW.RULES[r].name)).join(' · ')}</small></span></span>
      <span class="hn-foes">${(s.boss ? [s.boss] : s.mid ? [s.mid] : []).concat(ens).slice(0, 3).map((t) => `<img src="${ENEMIES[t].img}" alt="" loading="lazy" draggable="false">`).join('')}</span>
      ${b ? `<span class="hn-best"><b>🔥${b.heat}</b><small>${fmt(b.score)}점</small></span>` : open ? '<span class="hn-best new"><b>NEW</b></span>' : '<span class="hn-best"><b>🔒</b></span>'}
    </button>`;
  }).join('');
  C.show(`
    <div class="hw-scene"><div class="hw-sky" style="background-image:url('${KEYART}'), url('/img/lb/season/halloween_key.webp')"></div><i class="hw-moon"></i><div class="hw-fog"></div><div class="hw-batfly">${Array.from({ length: 6 }, (_, i) => `<i style="--i:${i};--y:${8 + ((i * 17) % 30)}%;--d:${(i * 1.7).toFixed(1)}s"></i>`).join('')}</div></div>
    <div class="hw-top"><button class="back" data-act="menu">‹ 로비</button><div class="hw-cur"><button class="hw-pill" data-act="hwShop">${candyIc()}<b>${fmt(h.candy | 0)}</b></button><span class="hw-pill d">${daysLeft()}일 남음</span></div></div>
    <div class="hw-title"><small>할로윈 이벤트 · 10/10 ~ 11/2</small><h2>할로윈 저주의 밤</h2><em>${esc(HW.HW.sub)}</em></div>
    <div class="hw-sync">${C.ic('scale', '', 'sm')}<span>이벤트에서는 전투력이 <b>강화 +${HW.HW.sync.meta} · ★${HW.HW.sync.star} · 영웅 장비</b>로 맞춰져요 · 더 키운 멤버는 강화 ${HW.HW.sync.per}마다 +1 (최대 +${HW.HW.sync.edge}) — <b>힘보다 조합 · 조작!</b></span></div>
    <div class="hw-score"><span><small>내 점수</small><b>${fmt(h.score | 0)}</b></span><span><small>클리어</small><b>${Object.keys(h.best).length}/${HW.STAGE_COUNT}</b></span><span><small>저주 합</small><b>🔥${Object.values(h.best).reduce((a, x) => a + (x.heat | 0), 0)}</b></span><button class="hw-mini" data-act="hwRank">${C.ic('trophy', '', 'sm')}랭킹${st.board && st.board.me && st.board.me.rank ? ` <b>${st.board.me.rank}위</b>` : ''}</button></div>
    <div class="hw-path">${nodes}</div>
    <div class="hw-menu"><button data-act="hwShop">${candyIc()}<small>사탕 상점</small></button><button data-act="hwCloset"><span class="hw-ic closet"></span><small>할로윈 의상</small>${HW.COSTUME_IDS.some((k) => (P().skins.own || []).includes(k)) ? '' : ''}</button><button data-act="hwRank">${C.ic('trophy', '', 'sm')}<small>랭킹</small></button><button data-act="hwFoes">${C.ic('book', '', 'sm')}<small>할로윈 진상</small></button><button data-act="hwHelp">${C.ic('bulb', '', 'sm')}<small>안내</small></button><button data-act="hwIntro">${C.ic('play', '', 'sm')}<small>인트로</small></button></div>
  `, 'hw-screen');
}

// ─── 출전 준비: 규칙 · 덱 · 저주 ───
const power = (id) => C.heroPower(P(), id);
const keyDeck = (n) => 'langbang:hwDeck:' + n;
function curDeck(n) {
  let d = st.decks[n];
  if (!d) { try { d = JSON.parse(lsGet(keyDeck(n)) || 'null'); } catch { d = null; } }
  if (!Array.isArray(d)) d = autoDeck(n);
  const rent = st.rent[n] || null;
  d = [...new Set(d.filter((h) => HEROES[h] && !HEROES[h].summon && (own(h) || h === rent)))];
  st.decks[n] = d;
  return d;
}
function saveDeck(n) { lsSet(keyDeck(n), JSON.stringify(st.decks[n] || [])); }
// 추천 덱: 꼭 필요한 멤버(가진 것) → 금지 아닌 센 멤버로 채움
export function autoDeck(n) {
  const s = HW.stageOf(n), max = Math.min(HW.HW.slots, ...s.rules.map((r) => HW.RULES[r].max || 99));
  const banned = (h) => s.rules.some((r) => HW.RULES[r].ban && HW.RULES[r].ban(h));
  const out = [];
  for (const r of s.rules) { const R = HW.RULES[r]; if (!R.need) continue; const mine = R.need.filter((h) => own(h) && !banned(h) && !out.includes(h)).sort((a, b) => power(b) - power(a)); for (const h of mine.slice(0, R.n || 1)) if (out.length < max) out.push(h); }
  const rest = Object.keys(HEROES).filter((h) => !HEROES[h].summon && own(h) && !banned(h) && !out.includes(h)).sort((a, b) => power(b) - power(a));
  for (const h of rest) { if (out.length >= max) break; out.push(h); }
  return out;
}
function curCurses(n) { if (!st.curses[n]) { try { st.curses[n] = JSON.parse(lsGet('langbang:hwCurse:' + n) || '[]'); } catch { st.curses[n] = []; } } st.curses[n] = HW.cleanCurses(st.curses[n]); return st.curses[n]; }
function showPrep(n) {
  n = Math.max(1, Math.min(HW.STAGE_COUNT, n | 0 || st.n || 1));
  if (n > HW.maxOpen(P()) && !P().master) { C.toast('앞 스테이지를 먼저 깨요', 1400); return; }
  st.n = n;
  C.app.screen = 'hwprep';
  renderPrep();
}
function renderPrep() {
  const n = st.n, s = HW.stageOf(n), h = hwOf(), b = h.best[n];
  const deck = curDeck(n), rent = st.rent[n] || null;
  const chk = HW.checkDeck(n, deck, own, rent);
  const sug = HW.suggest(n, deck, own, power);
  const cs = curCurses(n), heat = HW.curseScore(cs), cleared = !!b;
  const lo = HW.syncLoadout(P(), deck, rent);
  const foes = HW.stageEnemies(n);
  const ruleOk = (r) => !chk.errs.some((e) => e.rule === r);
  const slots = Array.from({ length: chk.max }, (_, i) => deck[i] || null);
  const banned = (hh) => s.rules.find((r) => HW.RULES[r].ban && HW.RULES[r].ban(hh));
  const needOf = (hh) => s.rules.find((r) => HW.RULES[r].need && HW.RULES[r].need.includes(hh));
  const card = (hh) => {
    const d = HEROES[hh], bn = banned(hh), nd = needOf(hh), inD = deck.includes(hh), m = lo.meta[hh] !== undefined ? lo.meta[hh] : HW.syncMeta((P().heroes || {})[hh]);
    const real = (P().heroes || {})[hh] | 0;
    return `<button class="hw-hc ${inD ? 'on' : ''} ${bn ? 'ban' : ''} ${nd ? 'need' : ''}" data-act="hwPick" data-h="${hh}" style="--c:${ATTRS[d.attr].color}">${C.av(d)}<b>${esc(d.name)}</b><small>+${m}${m > HW.HW.sync.meta ? '<i class="edge">↑</i>' : ''}${real > m ? `<s>+${real}</s>` : ''}</small>${bn ? `<em class="bn">${esc(HW.RULES[bn].icon)} 금지</em>` : nd ? `<em class="nd">${esc(HW.RULES[nd].icon)} 조건</em>` : ''}<i class="role r-${HERO_ROLE[hh] || 'special'}">${esc((HERO_ROLES[HERO_ROLE[hh] || 'special'] || {}).name || '')}</i></button>`;
  };
  const ownList = Object.keys(HEROES).filter((hh) => !HEROES[hh].summon && own(hh)).sort((a, x) => (banned(a) ? 1 : 0) - (banned(x) ? 1 : 0) || (needOf(x) ? 1 : 0) - (needOf(a) ? 1 : 0) || power(x) - power(a));
  const fix = sug.needs.map((q) => `<div class="hw-fix"><b>${esc(HW.RULES[q.rule].icon)} ${esc(HW.RULES[q.rule].name)}</b><span>${q.mine.length ? `넣기: ${q.mine.slice(0, 3).map((hh) => `<button class="hw-chip" data-act="hwAdd" data-h="${hh}">${C.av(HEROES[hh], 'xs')}${esc(HEROES[hh].name)}</button>`).join('')}` : ''}${!q.mine.length && q.rent.length ? `빌리기 (강화 +${HW.HW.sync.meta} · ★${HW.HW.sync.star}): ${q.rent.slice(0, 3).map((hh) => `<button class="hw-chip rent" data-act="hwRent" data-h="${hh}">${C.av(HEROES[hh], 'xs')}${esc(HEROES[hh].name)}</button>`).join('')}` : ''}</span></div>`).join('');
  const errs = chk.errs.filter((e) => e.hero || e.rule === null || !HW.RULES[e.rule].need).map((e) => `<li>${e.hero ? C.av(HEROES[e.hero], 'xs') : ''}${esc(e.text)}${e.hero ? ` <button class="hw-x" data-act="hwPick" data-h="${e.hero}">빼기</button>` : ''}</li>`).join('');
  const curseRows = HW.CURSE_IDS.map((k) => { const c = HW.CURSES[k], on = cs.includes(k), lock = !cleared || (c.need && !cs.includes(c.need)); return `<button class="hw-curse ${on ? 'on' : ''} ${lock ? 'lock' : ''}" data-act="hwCurse" data-k="${k}"><i>${esc(c.icon)}</i><span><b>${esc(c.name)}</b>${c.desc ? `<small>${esc(c.desc)}</small>` : ''}</span><em>+${c.pt}</em></button>`; }).join('');
  const sc = HW.stageScore(heat, 70), cand = HW.clearCandy(n, heat) + (cleared ? (b && heat > b.heat ? HW.heatCandy(heat - b.heat) : 0) : HW.firstCandy(n));
  const wb = HW.wearBonus(P(), deck);
  C.show(`
    <div class="hw-scene prep m-${s.map}"><div class="hw-sky" style="background-image:url('${HW.HW_MAPS[s.map].img}')"></div><div class="hw-fog"></div></div>
    <div class="hw-top"><button class="back" data-act="hw">‹ 이벤트</button><div class="hw-cur"><span class="hw-pill">${candyIc()}<b>${fmt(h.candy | 0)}</b></span></div></div>
    <div class="hw-prep">
      <div class="hp-head"><em>STAGE ${n}${s.boss ? ' · 최종 보스' : s.mid ? ' · 중간 보스' : ''}</em><h2>${esc(s.name)}</h2><p>${esc(s.story)}</p>${b ? `<span class="hp-best">최고 🔥${b.heat} · ${fmt(b.score)}점 · 입구 ${b.door}%</span>` : ''}</div>
      <div class="hp-sec rules"><h4>${C.ic('target', '', 'sm')}출전 제한</h4><div class="hp-rules">${s.rules.map((r) => `<div class="hp-rule ${ruleOk(r) ? 'ok' : 'no'}"><i>${esc(HW.RULES[r].icon)}</i><span><b>${esc(HW.RULES[r].name)}</b><small>${esc(HW.RULES[r].desc)}</small></span><em>${ruleOk(r) ? '✓' : '!'}</em></div>`).join('')}</div>${fix ? `<div class="hp-fixes">${fix}</div>` : ''}</div>
      <div class="hp-sec foes"><h4>${C.ic('ic_bosscrown', '', 'sm')}나오는 할로윈 진상 <small>탭하면 기술</small></h4><div class="hp-foes">${foes.map((t) => `<button class="hp-foe ${ENEMIES[t].boss ? 'boss' : ENEMIES[t].mid ? 'mid' : ''}" data-act="hwFoe" data-t="${t}"><img src="${ENEMIES[t].img}" alt="" draggable="false"><small>${esc(ENEMIES[t].name)}</small></button>`).join('')}</div></div>
      <div class="hp-sec deck"><h4>${C.ic('users', '', 'sm')}출전 멤버 <small>${deck.length}/${chk.max} · 전투력 맞춤 +${HW.HW.sync.meta} ★${HW.HW.sync.star}</small><button class="hw-mini" data-act="hwAuto">추천 덱</button></h4>
        <div class="hp-slots">${slots.map((hh) => (hh ? `<button class="hp-slot on ${hh === rent ? 'rent' : ''}" data-act="hwPick" data-h="${hh}">${C.av(HEROES[hh])}<b>${esc(HEROES[hh].name)}</b>${hh === rent ? '<em>대여</em>' : HW.wornMap(P())[hh] ? '<em class="cos">🎃 의상</em>' : ''}</button>` : '<span class="hp-slot empty">+</span>')).join('')}</div>
        ${errs ? `<ul class="hp-errs">${errs}</ul>` : ''}
        <div class="hp-grid">${ownList.map(card).join('')}</div>
      </div>
      <div class="hp-sec curse ${cleared ? '' : 'locked'}"><h4>${C.ic('fire', '', 'sm')}저주 고르기 <small>${cleared ? '저주를 걸수록 점수 · 사탕이 많아요' : '한 번 깨면 열려요'}</small><b class="hp-heat">🔥 ${heat}<small>/${HW.CURSE_MAX}</small></b></h4><div class="hp-curses">${curseRows}</div></div>
      <div class="hp-pay"><span>${C.ic('trophy', '', 'sm')}점수 약 <b>${fmt(sc)}</b>~</span><span>${candyIc('xs')}사탕 <b>${fmt(cand)}</b>${wb ? ` <i class="wb">의상 +${Math.round(wb * 100)}%</i>` : ''}</span></div>
    </div>
    <button class="hw-go ${chk.ok ? '' : 'off'}" data-act="hwGo" ${chk.ok ? '' : 'aria-disabled="true"'}><i class="hg-glow"></i><span><b>${chk.ok ? (heat ? `저주 🔥${heat} 걸고 출격!` : '출격!') : '출전 조건을 맞춰 주세요'}</b><small>${chk.ok ? `${deck.length}명 · ${esc(s.name)}` : esc(chk.errs[0].text)}</small></span></button>
  `, 'hw-screen hw-prepscr');
}

// ─── 출격 ───
async function go() {
  const n = st.n, deck = curDeck(n), rent = st.rent[n] || null;
  const chk = HW.checkDeck(n, deck, own, rent);
  if (!chk.ok) { C.toast(chk.errs[0].text, 2200); const el = document.querySelector('.hp-rules'); if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); } return; }
  const curses = curCurses(n);
  const r = await C.liveAct(C.API.hwStart(n, deck, chk.rent, curses, C.app.guest));
  if (!r) return;
  st.run = { n, runId: r.runId, deck: r.deck, rent: r.rent, curses: r.curses, heat: r.heat };
  C.app.hwRun = st.run;
  C.startRun({ mode: 'hw', force: true, hw: st.run });
}
// game.js startRun 이 createGame 에 덧붙이는 것: 판 정보 · 맞춘 전투력 · 자리
function gameOpt(run, p) {
  const def = HW.eventDef(run.n, run.curses, run.deck);
  const lo = HW.syncLoadout(p, run.deck, run.rent);
  const deck = C.placeDeck(run.deck);
  ensureArt(def);
  return { mode: 'stage', stage: def.stage, event: def, deck, meta: lo.meta, stars: lo.stars, gear: lo.gear, items: {}, coll: null, awake: {}, wtrait: undefined, slots: 6, hell: false, weekly: null };
}
function afterCreate(g) {
  resetHwFx();
  const s = HW.stageOf(g.ev.n);
  setTimeout(() => { if (C.app.g === g) C.fx.banner(`🎃 ${s.name}`, g.ev.curses.length ? `저주 🔥${HW.curseScore(g.ev.curses)} · ${g.ev.curses.map((k) => HW.CURSES[k].name).join(' · ')}` : HW.HW_MAPS[s.map].name, '#4a1466', 2.4, 'big'); }, 350);
}
// 이벤트 그림: 이번 판 진상(처음엔 안 받는다) · 맵
function ensureArt(def) {
  const R = C.R;
  const ids = new Set();
  for (const w of def.waves) { for (const x of w.g) ids.add(x[0]); for (const k of ['boss', 'boss2', 'mid']) if (w[k]) ids.add(w[k]); }
  for (const t of [...ids]) if (ENEMIES[t] && ENEMIES[t].splitInto) ids.add(ENEMIES[t].splitInto.type);
  if (ids.has('hw_reaper') || ids.has('hw_dracula')) ids.add('hw_ghost');
  if (ids.has('hw_dracula')) ids.add('hw_bat');
  if (R.loadLazy) R.loadLazy([...ids]);
  const key = 'map_hw_' + def.map;
  if (!R.images[key]) { const im = new Image(); im.decoding = 'async'; im.onload = () => R.bakeBg(); im.src = def.mapImg; R.images[key] = im; }
}
// 전투 이벤트 → 연출 (hw-fx.js)
function onEvent(g, e, loud) { hwEvent(C, g, e, loud); }

// ─── 결과 ───
function result(g, victory, quit) {
  const app = C.app;
  app.screen = 'result';
  C.hud.hidden = true;
  const run = app.hwRun || st.run || {};
  const sum = C.S.summary(g, g.t);
  const n = g.ev.n, s = HW.stageOf(n), win = !!victory;
  const heat = HW.curseScore(g.ev.curses);
  const door = Math.round((g.base.hp / g.base.max) * 100);
  const time = `${Math.floor(g.t / 60)}:${String(Math.floor(g.t % 60)).padStart(2, '0')}`;
  const kd = g.stats.kd | 0, br = g.stats.castBreak | 0;
  C.show(`
    <div class="hw-scene res ${win ? 'win' : 'lose'} m-${s.map}"><div class="hw-sky" style="background-image:url('${HW.HW_MAPS[s.map].img}')"></div><div class="hw-fog"></div>${win ? `<div class="hw-confetti">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i};--x:${(i * 53) % 100}%;--d:${((i * 0.37) % 2).toFixed(2)}s"></i>`).join('')}</div>` : ''}</div>
    <div class="hw-res ${win ? 'win' : 'lose'}">
      <em class="hr-no">STAGE ${n}</em>
      <h2>${win ? '저주를 이겨냈다!' : quit ? '오늘은 여기까지' : '저주에 삼켜졌다…'}</h2>
      <p class="sub">${esc(s.name)} · ${time}${heat ? ` · 🔥${heat}` : ''}</p>
      <div class="hr-score" id="hwScore">${win ? '<span class="spin"></span>' : ''}</div>
      <div class="stats"><div><small>처치</small><b>${fmt(sum.kills)}</b></div><div><small>입구</small><b>${door}%</b></div><div><small>끊기</small><b>${br}</b></div><div><small>쓰러짐</small><b>${kd}</b></div></div>
      <div class="hr-rw" id="hwRw">${win ? '' : `<div class="hr-tip">${esc(failTip(g))}</div>`}</div>
    </div>
    <div class="hw-resbtns">${win ? `<button class="hw-go" data-act="hwPrep" data-n="${n}"><i class="hg-glow"></i><span><b>저주 걸고 다시</b><small>점수 · 사탕 더 많이</small></span></button>${n < HW.STAGE_COUNT ? `<button class="btn primary" data-act="hwPrep" data-n="${n + 1}">다음 스테이지 ${n + 1}</button>` : ''}` : `<button class="hw-go retry" data-act="hwPrep" data-n="${n}"><span><b>다시 도전</b><small>조합 · 저주를 바꿔 보세요</small></span></button>`}<div class="grid2"><button class="btn" data-act="hw">이벤트 지도</button><button class="btn ghost" data-act="menu">로비</button></div></div>
  `, `hw-screen result-hw ${win ? 'win' : 'lose'}`);
  if (app.debugRun || !run.runId) { const rw = document.getElementById('hwRw'); if (rw) rw.innerHTML += '<div class="guest-note">연습 판은 기록을 저장하지 않아요</div>'; const sc = document.getElementById('hwScore'); if (sc) sc.innerHTML = ''; return; }
  Promise.resolve(C.API.hwFinish({ runId: run.runId, clear: win, durationSec: Math.round(g.t), kills: sum.kills, door, skills: sum.skills }, app.guest)).then((r) => {
    app.hwRun = null; st.run = null;
    if (r && r.ok && r.profile) { app.profile = r.profile; applySkins(); }
    const sc = document.getElementById('hwScore'), rw = document.getElementById('hwRw');
    if (!rw) return;
    if (!r || !r.ok) { rw.innerHTML = `<div class="err">기록을 저장하지 못했어요: ${esc((r && r.message) || '')}</div>`; if (sc) sc.innerHTML = ''; return; }
    if (!win) return;
    if (sc) sc.innerHTML = `<b data-to="${r.score}">${fmt(r.score)}</b><small>점${r.best ? ' · <i>최고 기록!</i>' : ''}</small><em>총점 ${fmt(r.total)}</em>`;
    const p = r.parts || {}, lines = [];
    if (p.first) lines.push(`<span class="g">첫 클리어 ${candyIc('xs')}+${p.first}</span>`);
    if (p.heat) lines.push(`<span class="g hot">새 저주 기록 🔥 ${candyIc('xs')}+${p.heat}</span>`);
    lines.push(`<span class="g">클리어 ${candyIc('xs')}+${p.clear | 0}${r.capped ? ' <small>(오늘 한도)</small>' : ''}</span>`);
    if (p.wear) lines.push(`<span class="g cos">🎃 의상 보너스 ${candyIc('xs')}+${p.wear}</span>`);
    setTimeout(() => { rw.innerHTML = `<div class="hr-lines">${lines.join('')}<span class="tot">${candyIc()}<b>+${r.candy}</b></span></div>`; try { C.A.sfx.reward ? C.A.sfx.reward() : C.A.sfx.levelUp(); } catch { /* 무시 */ } }, 500);
  });
}
function failTip(g) {
  const src = g.stats.kdBy || {}, top = Object.keys(src).sort((a, b) => src[b] - src[a])[0];
  if (top && ENEMIES[top]) { const sk = enemySkills(top)[0]; const ctr = sk && sk.counter && sk.counter.length ? sk.counter.slice(0, 3).map((h) => HEROES[h].name).join(' · ') : ''; return `${ENEMIES[top].name}에게 많이 당했어요${sk ? ` (${sk.name})` : ''}${ctr ? ` — ${ctr}이(가) 막아 줘요` : ''}`; }
  return '예고가 뜨면 기절 · 밀치기 스킬로 끊어 보세요 — 끊으면 빈틈이 생겨요';
}

// ─── 사탕 상점 ───
function shopPop() {
  const p = P(), h = hwOf(), ownS = p.skins.own || [];
  const row = (s) => {
    const left = HW.shopLeft(p, s.id), have = s.kind === 'costume' ? ownS.includes(s.id) : s.kind === 'title' ? (p.titles || []).includes(s.title) : s.kind === 'frame' ? (p.frames || []).includes(s.frame) : false;
    const art = s.kind === 'costume' ? `<img class="hs-art cos" src="${HW.costumeArt(s.id).thumb}" alt="" onerror="this.onerror=null;this.src='${HEROES[HW.COSTUMES[s.id].hero].img}'">` : `<span class="hs-art k-${s.kind}"></span>`;
    return `<div class="hs-row ${have || left <= 0 ? 'done' : ''}">${art}<span class="hs-t"><b>${esc(s.name)}</b><small>${s.kind === 'costume' ? esc(HW.COSTUMES[s.id].sub) : s.n > 1 ? `남은 수 ${left}/${s.n}` : ''}</small></span><button class="hs-buy" data-act="hwBuy" data-id="${s.id}" ${have || left <= 0 || (h.candy | 0) < s.cost ? 'disabled' : ''}>${have ? '보유' : left <= 0 ? '다 샀어요' : `${candyIc('xs')}${fmt(s.cost)}`}</button></div>`;
  };
  C.popup(`<h3>${candyIc()}사탕 상점 <small class="hs-have">${candyIc('xs')}${fmt(h.candy | 0)}</small></h3>
    <p class="ip">사탕은 이벤트 스테이지를 깨면 받아요 · 저주를 많이 걸수록 더 · 의상 입은 멤버는 +${Math.round(HW.HW.wear * 100)}%씩 (하루 다시 깨기 한도 ${HW.HW.dayCap})</p>
    <div class="hs-list">${HW.SHOP.map(row).join('')}</div>
    <p class="ip small">의상은 능력치가 같아요 (겉모습 · 투사체 색만) · 이벤트가 끝나도 계속 입을 수 있어요</p>
    <button class="btn" data-x>닫기</button>`, 'hw-pop hw-shop');
}
// ─── 의상실 ───
function closetPop() {
  const p = P(), ownS = p.skins.own || [], worn = HW.wornMap(p);
  const cards = HW.COSTUME_IDS.map((id) => {
    const c = HW.COSTUMES[id], have = ownS.includes(id), on = worn[c.hero] === id, a = HW.costumeArt(id), heroOk = own(c.hero);
    return `<div class="hc-card ${have ? 'have' : ''} ${on ? 'on' : ''}" style="--t:${c.tint}"><img class="hc-art" src="${a.thumb}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${HEROES[c.hero].img}'"><span class="hc-t"><b>${esc(c.name)}</b><small>${esc(c.sub)}</small></span>${have ? `<button class="hc-btn ${on ? 'on' : ''}" data-act="hwWear" data-h="${c.hero}" data-id="${on ? '' : id}" ${heroOk ? '' : 'disabled'}>${on ? '입는 중 · 벗기' : heroOk ? '입기' : '멤버 없음'}</button>` : `<button class="hc-btn buy" data-act="hwShop">${candyIc('xs')}${fmt((HW.shopItem(id) || {}).cost || 0)}</button>`}</div>`;
  }).join('');
  C.popup(`<h3>🎃 할로윈 의상실</h3><p class="ip">의상은 능력치가 같아요 · 전투 · 로비 · 도감 그림과 투사체 색이 바뀌어요 · 의상 입은 멤버를 이벤트에 데려가면 사탕 +${Math.round(HW.HW.wear * 100)}%</p><div class="hc-grid">${cards}</div><button class="btn" data-x>닫기</button>`, 'hw-pop hw-closet');
}
// 멤버 상세 창에 끼우는 의상 칸 (가진 의상이 있을 때만 · 기간이 지나도)
function heroSkinHtml(id) {
  const cid = HW.costumeOf(id); if (!cid) return '';
  const p = P(), have = (p.skins.own || []).includes(cid);
  if (!have && !HW.hwSeason()) return '';
  const on = HW.wornMap(p)[id] === cid, c = HW.COSTUMES[cid];
  return `<div class="hm-sec hw-hm"><h4>🎃 할로윈 의상 <small>${have ? '능력치 같음 · 겉모습만' : '사탕 상점에서'}</small></h4><div class="hw-hmrow"><img src="${HW.costumeArt(cid).thumb}" alt="" onerror="this.onerror=null;this.src='${HEROES[id].img}'"><span><b>${esc(c.name)}</b><small>${esc(c.sub)}</small></span>${have ? `<button class="hc-btn ${on ? 'on' : ''}" data-act="hwWear" data-h="${id}" data-id="${on ? '' : cid}">${on ? '벗기' : '입기'}</button>` : `<button class="hc-btn buy" data-act="hwShop">상점</button>`}</div></div>`;
}
// ─── 랭킹 ───
async function loadBoard(force) {
  if (!force && st.board && Date.now() - st.boardAt < 60e3) return st.board;
  const bd = await C.API.hwBoard().catch(() => null);
  if (bd) { st.board = bd; st.boardAt = Date.now(); }
  return bd;
}
async function rankPop() {
  const bd = await loadBoard(true);
  const rows = bd && bd.top.length ? bd.top.map((x) => `<div class="hr-row ${x.rank <= 3 ? 't' + x.rank : ''}"><em>${x.rank}</em><span>${C.whoHtml ? C.whoHtml(x.nickname, x.title, x.frame) : esc(x.nickname)}</span><small>${x.cleared}/${HW.STAGE_COUNT} · 🔥${x.heat}</small><b>${fmt(x.score)}</b></div>`).join('') : '<p class="ip">아직 기록이 없어요 — 첫 번째가 되어 보세요!</p>';
  const me = bd && bd.me;
  C.popup(`<h3>${C.ic('trophy', '', 'sm')}할로윈 랭킹</h3><p class="ip">스테이지마다 최고 점수의 합 · 점수 = 클리어 1000 + 저주 1점마다 250 + 남은 입구 % × 3</p><div class="hr-list">${rows}</div>${me ? `<div class="hr-me">내 순위 <b>${me.rank ? me.rank + '위' : '-'}</b> · ${fmt(me.score)}점</div>` : C.app.guest ? '<p class="ip">로그인하면 랭킹에 올라가요</p>' : ''}<p class="ip small">이벤트가 끝나면 순위 보상: 1~3위 칭호 「할로윈 저주왕」 + 모집권 · 강화석 / TOP 10 · 참가 보상</p>${me && me.rank && !bd.season && !me.paid ? '<button class="btn primary" data-act="hwClaim">순위 보상 받기</button>' : ''}<button class="btn" data-x>닫기</button>`, 'hw-pop hw-rank');
}
function foesPop(only) {
  const ids = only ? [only] : HW.HW_ENEMY_IDS.filter((t) => t !== 'hw_seed');
  const card = (t) => { const d = ENEMIES[t]; const sk = enemySkills(t); return `<div class="hf-card ${d.boss ? 'boss' : d.mid ? 'mid' : ''}"><img src="${d.img}" alt="" loading="lazy"><span><b>${esc(d.name)}</b><small>${d.boss ? '최종 보스' : d.mid ? '중간 보스' : '할로윈 진상'}${d.armor ? ` · 방어 ${d.armor}` : ''}</small>${sk.map((x) => `<p><i style="--c:${(EST[x.st] || {}).color || '#ccc'}">${esc((EST[x.st] || {}).icon || '•')}</i><b>${esc(x.name)}</b> ${esc(x.text)}${x.counter.length ? ` <em>막는 멤버: ${x.counter.slice(0, 3).map((h) => esc(HEROES[h].name)).join(' · ')}</em>` : ''}</p>`).join('')}</span></div>`; };
  C.popup(`<h3>${C.ic('book', '', 'sm')}${only ? esc(ENEMIES[only].name) : '할로윈 진상'}</h3><div class="hf-list">${ids.map(card).join('')}</div><button class="btn" data-x>닫기</button>`, 'hw-pop hw-foes');
}
function helpPop() {
  C.popup(`<h3>🎃 할로윈 저주의 밤 안내</h3>
    <div class="hw-help">
      <div><b>① 전투력 맞춤</b><small>모든 멤버가 강화 +${HW.HW.sync.meta} · ★${HW.HW.sync.star} · 영웅 장비로 맞춰져요. 더 키운 멤버는 강화 ${HW.HW.sync.per}마다 +1 (최대 +${HW.HW.sync.edge}) — 키운 보람은 조금, 이기는 건 조합!</small></div>
      <div><b>② 출전 제한</b><small>스테이지마다 규칙이 있어요 (서포터 2명 · 원거리만 · 술 속성만 …). 조건 멤버가 없으면 한 명은 빌려 갈 수 있어요.</small></div>
      <div><b>③ 할로윈 진상</b><small>예고가 뜨면 기절 · 빙결 · 밀치기로 끊으세요. 좀비는 다시 일어나고 · 귀신은 사라지고 · 저승사자는 명부에 이름을 적어요.</small></div>
      <div><b>④ 저주 고르기</b><small>깬 스테이지는 저주를 걸고 다시 — 저주 점수만큼 랭킹 점수 · 사탕이 늘어요.</small></div>
      <div><b>⑤ 사탕 · 의상</b><small>사탕으로 할로윈 의상 · 칭호 · 장비 · 모집권 · 박나영 조각. 의상 입은 멤버를 데려가면 사탕 +${Math.round(HW.HW.wear * 100)}%씩.</small></div>
    </div><button class="btn primary" data-x>알겠어요</button>`, 'hw-pop hw-helppop');
}

// ─── 인트로 (영상이 있으면 영상 · 없으면 코드 연출) — 시즌에 한 번 · 건너뛰기 · 소리는 탭해서 ───
function playIntro(done) {
  lsSet(INTRO.key, '1');
  const rm = document.body.classList.contains('rm');
  const d = document.createElement('div');
  d.className = 'hw-intro';
  d.innerHTML = `<video class="hi-vid" playsinline muted preload="auto" poster="${INTRO.poster}"></video>
    <div class="hi-css"><i class="hi-moon"></i><i class="hi-alley"></i>${Array.from({ length: 7 }, (_, i) => `<i class="hi-bat" style="--i:${i}"></i>`).join('')}${Array.from({ length: 5 }, (_, i) => `<i class="hi-pump" style="--i:${i}"></i>`).join('')}<i class="hi-fog"></i></div>
    <div class="hi-title"><small>랑방대전 할로윈 이벤트</small><b>할로윈 저주의 밤</b><em>10/10 ~ 11/2</em></div>
    <button class="hi-snd" aria-label="소리 켜기">🔇 탭해서 소리</button><button class="hi-skip">건너뛰기 ›</button>`;
  C.stage.appendChild(d);
  const v = d.querySelector('video');
  let closed = false;
  const close = () => { if (closed) return; closed = true; d.classList.add('out'); try { v.pause(); } catch { /* 무시 */ } setTimeout(() => { d.remove(); if (C.app.touched) C.A.playBgm(); }, 380); done && done(); };
  d.querySelector('.hi-skip').addEventListener('click', (e) => { e.stopPropagation(); close(); });
  d.querySelector('.hi-snd').addEventListener('click', (e) => { e.stopPropagation(); v.muted = !v.muted; e.currentTarget.textContent = v.muted ? '🔇 탭해서 소리' : '🔊 소리 켜짐'; if (!v.muted) C.A.pauseBgm && C.A.pauseBgm(); });
  const cssIntro = () => { d.classList.add('css'); setTimeout(close, rm ? 1600 : 6200); };
  if (rm || (navigator.connection && navigator.connection.saveData)) { cssIntro(); return; }
  v.addEventListener('ended', close);
  v.addEventListener('error', cssIntro);
  v.addEventListener('playing', () => d.classList.add('vid'));
  v.src = INTRO.video;
  const p = v.play(); if (p && p.catch) p.catch(cssIntro);
  setTimeout(() => { if (!closed && !d.classList.contains('vid') && !d.classList.contains('css')) cssIntro(); }, 2500);
}

// ─── 버튼 ───
const ACTS = {
  hw: () => showHub(),
  hwPrep: (b) => showPrep(Number(b.dataset.n)),
  hwPick: (b) => {
    const n = st.n, h = b.dataset.h, d = curDeck(n).slice(), s = HW.stageOf(n), max = Math.min(HW.HW.slots, ...s.rules.map((r) => HW.RULES[r].max || 99));
    const i = d.indexOf(h);
    if (i >= 0) { d.splice(i, 1); if (st.rent[n] === h) st.rent[n] = null; }
    else { const bn = s.rules.find((r) => HW.RULES[r].ban && HW.RULES[r].ban(h)); if (bn) { C.toast(`${HEROES[h].name}: ${HW.RULES[bn].name} — 이번 판은 못 들어가요`, 1800); return; } if (d.length >= max) { C.toast(`${max}명까지 — 뺄 멤버를 먼저 눌러요`, 1500); return; } d.push(h); }
    st.decks[n] = d; saveDeck(n); C.A.sfx.tap(); renderPrep();
  },
  hwAdd: (b) => { const n = st.n, h = b.dataset.h, d = curDeck(n).slice(), s = HW.stageOf(n), max = Math.min(HW.HW.slots, ...s.rules.map((r) => HW.RULES[r].max || 99)); if (!d.includes(h)) { if (d.length >= max) { const out = d.slice().reverse().find((x) => !s.rules.some((r) => HW.RULES[r].need && HW.RULES[r].need.includes(x))); if (out) d.splice(d.indexOf(out), 1); } d.push(h); } st.decks[n] = d; saveDeck(n); C.A.sfx.card(); renderPrep(); },
  hwRent: (b) => { const n = st.n, h = b.dataset.h, d = curDeck(n).filter((x) => x !== st.rent[n]), s = HW.stageOf(n), max = Math.min(HW.HW.slots, ...s.rules.map((r) => HW.RULES[r].max || 99)); st.rent[n] = h; if (d.length >= max) { const out = d.slice().reverse().find((x) => !s.rules.some((r) => HW.RULES[r].need && HW.RULES[r].need.includes(x))); if (out) d.splice(d.indexOf(out), 1); } d.push(h); st.decks[n] = d; saveDeck(n); C.toast(`${HEROES[h].name}을(를) 빌렸어요 (강화 +${HW.HW.sync.meta} · ★${HW.HW.sync.star})`, 1800); renderPrep(); },
  hwAuto: () => { const n = st.n; st.rent[n] = null; st.decks[n] = autoDeck(n); saveDeck(n); C.A.sfx.card(); renderPrep(); },
  hwCurse: (b) => {
    const n = st.n, k = b.dataset.k, c = HW.CURSES[k], b0 = hwOf().best[n];
    if (!b0) { C.toast('한 번 깬 스테이지에만 저주를 걸 수 있어요', 1600); return; }
    let cs = curCurses(n).slice();
    if (cs.includes(k)) cs = cs.filter((x) => x !== k && HW.CURSES[x].need !== k);
    else { if (c.need && !cs.includes(c.need)) { C.toast(`먼저 「${HW.CURSES[c.need].name}」을 걸어요`, 1600); return; } cs.push(k); }
    st.curses[n] = HW.cleanCurses(cs); lsSet('langbang:hwCurse:' + n, JSON.stringify(st.curses[n])); C.A.sfx.tap(); renderPrep();
  },
  hwGo: () => go(),
  hwShop: () => shopPop(),
  hwBuy: async (b) => { const r = await C.liveAct(C.API.hwShop(b.dataset.id, C.app.guest)); if (r) { try { C.A.sfx.reward ? C.A.sfx.reward() : C.A.sfx.levelUp(); } catch { /* 무시 */ } C.toast(r.got && r.got.costume ? `${HW.COSTUMES[r.got.costume].name} 획득! 의상실에서 입어요` : `샀어요! ${C.gotText(r.got)}`, 2200); shopPop(); if (C.app.screen === 'hw') renderHub(); } },
  hwCloset: () => closetPop(),
  hwWear: async (b) => { const r = await C.liveAct(C.API.hwWear(b.dataset.h, b.dataset.id || null, C.app.guest)); if (r) { applySkins(); C.A.sfx.tap(); C.toast(b.dataset.id ? `${HW.COSTUMES[b.dataset.id].name} 입었어요!` : '원래 옷으로 갈아입었어요', 1500); if (document.querySelector('.hw-closet')) closetPop(); else if (C.reopenHero) C.reopenHero(b.dataset.h); if (C.app.screen === 'hwprep') renderPrep(); } },
  hwRank: () => rankPop(),
  hwClaim: async () => { const r = await C.liveAct(C.API.hwClaim()); if (r) { C.popup(`<h3>${C.ic('trophy', '', 'sm')}할로윈 랭킹 ${r.rank}위!</h3><p class="ip big-got">${esc(r.label)}</p><p class="ip">${esc(C.gotText(r.got))}</p><button class="btn primary" data-x>받았어요</button>`, 'hw-pop'); } },
  hwFoes: () => foesPop(),
  hwFoe: (b) => foesPop(b.dataset.t),
  hwHelp: () => helpPop(),
  hwIntro: () => playIntro(null),
};
void KD_SUP; void heroTier; void TIER_NAME; void HWS;
