// 랑방 대전 — 1:1 맞대결 (v2) 화면: 매칭 · 대기 · 맞대결(위 = 상대 판 180도 · 아래 = 내 판) · 조작 · 결과
//  서버(/lbpvp2)가 판을 돌리고 0.1초마다 장면을 보낸다 → 이 화면은 두 장면 사이를 부드럽게 이어 그린다 (0.1초 늦게)
//  game.js 는 initPvp2(도우미) 로 부르고 돌려받은 함수 몇 개만 쓴다
import { HEROES, ENEMIES } from './data.js';
import { PV2, ST, HEX_NAME, unpackSnap, pvp2Phase, pvp2LeftText } from './pvp2.js';

let C = null;
const st = { sock: null, match: null, side: 0, wait: null, el: null, cv: null, cx: null, raf: 0, buf: [], opBuf: [], fx: [], texts: [], img: {}, bg: null, swapPick: -1, last: null, lay: null, shake: 0, hurt: 0, ended: null, want: null, rooms: null, prevMe: null, prevOp: null };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sfx = (k) => { try { if (C.A && C.A.sfx && C.A.sfx[k]) C.A.sfx[k](); } catch { /* 소리 없이 */ } };
const HCOL = { stun: '#ffd23f', charm: '#ff6fb5', silence: '#b48cff', slow: '#6fb3ff', guard: '#5fd0ff', cleanse: '#7dffb0' };
const PH_NAME = ['', '과열!', '폭주!', '서든데스'];
const PH_SUB = ['', '보내기가 두 배로 가요', '보스 묶음 · 25명마다 중간 보스 자동', '큰 웨이브 · 입구가 무너져요'];

export function initPvp2(ctx) {
  C = ctx;
  return { queue, room, enter, botNow, cancel, listRooms, active: () => !!st.match, acts: ACTS, debug: st };
}

// ─── 소켓 ───
function loadIo() {
  if (window.io) return Promise.resolve(window.io);
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/socket.io/socket.io.js'; s.onload = () => res(window.io); s.onerror = rej; document.head.appendChild(s); });
}
function gid() {
  try { let id = localStorage.getItem('langbang:pvpGid'); if (!id || !/^[A-Za-z0-9_-]{8,40}$/.test(id)) { id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join(''); localStorage.setItem('langbang:pvpGid', id); } return id; } catch { return ''; }
}
async function sock() {
  if (st.sock) return st.sock;
  const io = await loadIo();
  const s = io('/lbpvp2', { transports: ['websocket', 'polling'], auth: (cb) => cb({ token: (C.API.authToken && C.API.authToken()) || '', gid: gid(), mid: (st.match && st.match.id) || (st.ended && st.ended.id) || '' }) });
  st.sock = s;
  let first = true;
  s.on('connect', () => { if (first) { first = false; return; } if (!st.match && st.want && st.wait && st.wait.isConnected) st.want(); }); // 다시 붙음: 아직 찾는 중이면 다시 찾기
  s.on('match', (m) => matched(m));
  s.on('rejoin', (m) => rejoined(m));
  s.on('snap', (x) => onSnap(x));
  s.on('end', (r) => onEnd(r));
  s.on('rooms', (list) => { st.rooms = list; if (C.onRooms) C.onRooms(list); });
  s.on('roomClosed', () => { closeWait(); C.toast('방이 10분 동안 비어서 닫혔어요', 1800); });
  return s;
}
// 대전 덱: 산 덱 칸과 상관없이 모두 6명 (필드 4 + 벤치 2) — 덱이 모자라면 가진 멤버 중 센 순서로 벤치를 채운다 (대전에서만)
export function fillDeck(deck, owned, power, max = PV2.deckMax) {
  const ids = (deck || []).filter((id) => id && HEROES[id] && !HEROES[id].summon).slice(0, max);
  const rest = (owned || []).filter((id) => HEROES[id] && !HEROES[id].summon && !ids.includes(id)).sort((a, b) => power(b) - power(a));
  while (ids.length < max && rest.length) ids.push(rest.shift());
  return ids;
}
function pvpDeck() { return fillDeck(C.curDeck(), C.owned ? C.owned() : [], (id) => (C.heroPower ? C.heroPower(id) : 0) || 0); }
// 손님: 덱 멤버의 강화 · 성급 · 장비 (서버가 대전 한도로 잘라서 쓴다)
function payload(extra) {
  C.fixDeck();
  const p = C.P(), ids = pvpDeck(), o = Object.assign({ deck: ids }, extra || {});
  if (C.app.guest) {
    const eq = {}, gids = new Set();
    for (const id of ids) { const sl = (p.equip || {})[id]; if (sl) { eq[id] = { w: sl.w, a: sl.a, m: sl.m }; for (const k of ['w', 'a', 'm']) if (sl[k] !== undefined) gids.add(sl[k]); } }
    const pick = (m) => Object.fromEntries(ids.map((id) => [id, (m || {})[id] | 0]));
    o.lo = { heroes: pick(p.heroes), hstars: pick(p.hstars), equip: eq, gear: (p.gear || []).filter((it) => gids.has(it.id)).map((it) => ({ id: it.id, t: it.t, r: it.r, lv: it.lv | 0 })) };
  }
  return o;
}
const noServer = () => C.toast('서버에 연결할 수 없어요');
async function queue() {
  const s = await sock().catch(() => null); if (!s) return noServer();
  st.want = queue;
  s.emit('queue', payload(), (r) => { if (!r || !r.ok) C.toast((r && r.message) || '매칭할 수 없어요'); else if (r.waiting) waitModal('상대 찾는 중', null, r.botIn); });
}
async function botNow() {
  const s = await sock().catch(() => null); if (!s) return noServer();
  s.emit('botnow', payload(), (r) => { if (!r || !r.ok) C.toast((r && r.message) || '지금은 안 돼요'); });
}
async function room(join) {
  const s = await sock().catch(() => null); if (!s) return noServer();
  if (join) {
    const code = await C.inputBox({ title: '방 코드로 참가', placeholder: '4자리 숫자', max: 4, numeric: true, ok: '참가' });
    if (code) enter(code.trim());
    return;
  }
  const title = await C.inputBox({ title: '방 만들기', placeholder: '한 판 붙자!', max: 20, ok: '만들기', sub: '방 제목 (안 써도 돼요)', useHint: true });
  if (title === null) return;
  st.want = () => s.emit('room:create', payload({ title }), (r) => { if (r && r.ok) waitModal('방을 만들었어요', r.code); });
  st.want();
}
async function enter(code) {
  const s = await sock().catch(() => null); if (!s) return noServer();
  s.emit('room:join', payload({ code: String(code) }), (r) => { if (!r || !r.ok) C.toast((r && r.message) || '들어갈 수 없어요'); });
}
function cancel() { if (st.sock) st.sock.emit('cancel'); st.want = null; closeWait(); }
function listRooms() { return sock().then((s) => new Promise((res) => s.emit('rooms:list', {}, (r) => res((r && r.rooms) || [])))); }

// ─── 대기 ───
function closeWait() { if (st.wait) { st.wait.remove(); st.wait = null; } }
function waitModal(text, code, botIn) {
  closeWait(); C.closeInfoCard();
  const m = document.createElement('div');
  m.className = 'info-modal pvp-wait pv-search pv2-wait';
  const rt = (C.P().pvp || {}).rating || 1000;
  m.innerHTML = `<div class="ps-radar"><i></i><i></i><i></i>${C.tierEmb(rt, 'mid')}</div>
    <b class="ps-t">${esc(text)}</b><span class="ps-time">0:00</span>
    <small class="ps-note">맞대결: 서로의 판이 보이고, 내 스킬이 상대 멤버를 묶어요 · 전투력이 비슷한 상대를 먼저 찾아요</small>${botIn ? `<small class="ps-ai" data-until="${Date.now() + botIn}">AI 대전까지 ${Math.ceil(botIn / 1000)}초</small>` : ''}
    <button class="btn primary ps-bot" data-p2="bot">AI와 바로 대전</button>
    ${code ? `<div class="pvp-code">${code}</div><button class="btn primary big-share" data-act="pvpShare" data-code="${code}">초대 링크 보내기</button>` : ''}
    <p class="ps-tip"><span>${esc(TIPS[0])}</span></p>
    <button class="btn ghost ps-x" data-p2="cancel">취소</button>`;
  m.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-p2],[data-act]'); if (!b) return;
    if (b.dataset.p2 === 'bot') { b.disabled = true; botNow(); } else if (b.dataset.p2 === 'cancel') cancel(); else if (C.act) C.act(b);
  });
  C.stage.appendChild(m);
  st.wait = m;
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (!m.isConnected) { clearInterval(iv); return; }
    const s = Math.floor((Date.now() - t0) / 1000);
    m.querySelector('.ps-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const ai = m.querySelector('.ps-ai'); if (ai) { const left = Math.max(0, Math.ceil((Number(ai.dataset.until) - Date.now()) / 1000)); ai.textContent = left ? `AI 대전까지 ${left}초` : 'AI 상대 준비 중…'; }
    if (s && s % 4 === 0) m.querySelector('.ps-tip span').textContent = TIPS[(s / 4) % TIPS.length];
  }, 250);
}
const TIPS = ['내 멤버가 스킬을 쓰면 상대 멤버에게 견제가 날아가요', '군중 제어 = 기절 · 저격 = 홀림 · 특수 = 침묵 · 범위 = 둔화', '탱커 스킬은 우리 팀 방패 · 지원 스킬은 우리 팀 해제', '묶인 멤버는 [정신 차려!] 로 바로 풀어요 (10초 쿨)', '견제가 날아오는 동안 벤치와 바꾸면 빗나가요', '상대 멤버를 누르면 그 멤버를 노려요', '입구가 20% 넘게 밀리면 추격: 총공지 · 보내기가 쉬워져요', '처치 10명 = 진상 5명 · 30명 = 중간 보스 보내기'];

// ─── 판 시작 ───
function matched(m) {
  closeWait(); C.closeInfoCard();
  st.match = m; st.side = m.side; st.roster = m.roster || []; st.types = []; st.buf = []; st.opBuf = []; st.fx = []; st.texts = []; st.ended = null; st.swapPick = -1; st.prevMe = null; st.prevOp = null;
  const startIn = Math.max(800, m.startIn || 3000);
  C.vs({ you: m.you, opp: m.opp, startIn, aiNotice: m.aiNotice || 0 });
  setTimeout(() => { if (st.match === m) openScreen(); }, Math.max(0, startIn - 650));
}
function rejoined(m) {
  if (st.match && st.match.id === m.id && st.el) { C.toast('대전에 다시 연결됐어요', 1400); return; }
  closeWait(); C.closeInfoCard();
  st.match = m; st.side = m.side; st.roster = m.roster || []; st.types = []; st.buf = []; st.opBuf = []; st.fx = []; st.texts = []; st.ended = null;
  C.toast('하던 대전으로 다시 들어왔어요', 1600);
  openScreen();
}

// ─── 맞대결 화면 ───
function openScreen() {
  if (st.el) st.el.remove();
  const m = st.match;
  const el = document.createElement('div');
  el.className = 'pv2';
  el.innerHTML = `<canvas class="pv2-cv"></canvas>
    <div class="pv2-top">
      <button class="pv2-quit" data-p2="quit" aria-label="기권">✕</button>
      <span class="pv2-who op">${C.tierEmb(m.opp.rating, 'xs')}<b>${esc(m.opp.nickname)}</b>${m.opp.ai ? '<i class="pv2-ai">AI</i>' : ''}</span>
      <span class="pv2-door op"><i></i><b>100%</b></span>
    </div>
    <div class="pv2-mid"><span class="pv2-ph"></span><b class="pv2-time">4:00</b><span class="pv2-k"></span></div>
    <div class="pv2-bot"><span class="pv2-door me"><i></i><b>100%</b></span><span class="pv2-tags"></span></div>
    <div class="pv2-ctl">
      <div class="pv2-mom"><i></i><i></i><small>기세</small></div>
      <div class="pv2-sk"></div>
      <div class="pv2-row">
        <div class="pv2-bench"></div>
        <button class="pv2-b cl" data-p2="cl"><span>정신<br>차려!</span><em></em></button>
        <button class="pv2-b send" data-p2="send"><span>보내기</span><small>0/10</small></button>
        <button class="pv2-b ult" data-p2="ult"><span>총공지</span><i></i></button>
      </div>
    </div>`;
  C.stage.appendChild(el);
  st.el = el; st.cv = el.querySelector('.pv2-cv'); st.cx = st.cv.getContext('2d', { alpha: false });
  C.setOn(true);
  el.addEventListener('click', onClick);
  const skEl = el.querySelector('.pv2-sk');
  skEl.addEventListener('pointerdown', skDown); skEl.addEventListener('pointermove', skMove); skEl.addEventListener('pointerup', skUp); skEl.addEventListener('pointercancel', skUp);
  st.cv.addEventListener('pointerdown', onTap);
  layout();
  if (!st.onResize) { st.onResize = () => { clearTimeout(st.rzT); st.rzT = setTimeout(() => { if (st.el) layout(); }, 140); }; window.addEventListener('resize', st.onResize); } // (game.js 가 무대 크기를 먼저 바꾼 뒤)
  loadArt();
  cancelAnimationFrame(st.raf);
  let prev = performance.now();
  const loop = (now) => { if (!st.el) return; st.raf = requestAnimationFrame(loop); const dt = Math.min(0.1, (now - prev) / 1000); prev = now; draw(now, dt); };
  st.raf = requestAnimationFrame(loop);
}
function closeScreen() {
  cancelAnimationFrame(st.raf); st.raf = 0;
  if (st.el) st.el.remove();
  st.el = null; st.cv = null; st.cx = null;
  C.setOn(false);
}
function layout() {
  const el = st.el, cv = st.cv;
  const ctl = el.querySelector('.pv2-ctl');
  const w = el.clientWidth || 360, h = el.clientHeight || 640, ch = ctl.offsetHeight || 150;
  const cssH = Math.max(200, h - ch);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.style.width = w + 'px'; cv.style.height = cssH + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(cssH * dpr);
  const k = w / 360, Hc = cssH / k;
  const topH = 34, midH = 24, botH = 22;
  const fieldH = (Hc - topH - midH - botH) / 2;
  st.ctlH = ch;
  st.lay = { k, dpr, Hc, topH, midH, botH, fieldH, opTop: topH, midY: topH + fieldH, myTop: topH + fieldH + midH, myBot: topH + fieldH * 2 + midH };
  el.querySelector('.pv2-mid').style.top = `${(st.lay.midY) * k}px`;
  el.querySelector('.pv2-mid').style.height = `${midH * k}px`;
  el.querySelector('.pv2-bot').style.top = `${st.lay.myBot * k}px`;
  st.bg = null; // 배경 다시 굽기
}
// 판 좌표 → 화면 (나: 그대로 · 상대: 180도)
//  상대 판은 멤버 그림이 발에서 위로 서니까 맨 위 띠에 안 가리게 OP_PAD 만큼 내려서
const Y0 = -40, Y1 = 600, OP_PAD = 40;
function toScr(side, x, y) {
  const L = st.lay, f = (y - Y0) / (Y1 - Y0);
  return side === 'me' ? [x, L.myTop + f * L.fieldH] : [360 - x, L.opTop + OP_PAD + (1 - f) * (L.fieldH - OP_PAD)];
}
st.toScr = (side, x, y) => toScr(side, x, y);

// ─── 그림 ───
function im(src) {
  if (!src) return null;
  let o = st.img[src];
  if (!o) { o = st.img[src] = new Image(); o.decoding = 'async'; o.src = src; }
  return o.complete && o.naturalWidth ? o : null;
}
function loadArt() {
  im('/img/lb/bg.webp');
  const ids = [...(st.match.deck || []), ...(st.match.oppDeck || [])];
  for (const id of ids) if (HEROES[id]) { im(HEROES[id].img); im(`/img/lb/ui2/sk_${id}.webp`); }
  for (const id of ['mukti', 'drunk_run', 'mid_drunk', 'mid_thug']) if (ENEMIES[id]) im(ENEMIES[id].img);
}
function bakeBg() {
  const L = st.lay, k = L.k * L.dpr;
  const bg = im('/img/lb/bg.webp');
  const c = document.createElement('canvas');
  c.width = st.cv.width; c.height = st.cv.height;
  const x = c.getContext('2d');
  x.scale(k, k);
  x.fillStyle = '#120f22'; x.fillRect(0, 0, 360, L.Hc);
  if (bg) {
    // 내 판: 골목 아래쪽(랑방 문이 아래) · 상대 판: 같은 골목을 180도 돌려서 (상대 랑방이 맨 위)
    const sw = bg.naturalWidth, sh = bg.naturalHeight, srcH = sw * (L.fieldH / 360) * 1.25, sy = Math.max(0, sh * 0.9 - srcH);
    x.drawImage(bg, 0, sy, sw, srcH, 0, L.myTop, 360, L.fieldH);
    x.save(); x.translate(360, L.opTop + L.fieldH); x.rotate(Math.PI);
    x.drawImage(bg, 0, sy, sw, srcH, 0, 0, 360, L.fieldH);
    x.restore();
  }
  // 상대 판은 붉게 · 내 판은 살짝 어둡게 (글자 · 진상이 잘 보이게)
  x.fillStyle = 'rgba(70,10,30,0.42)'; x.fillRect(0, L.opTop, 360, L.fieldH);
  x.fillStyle = 'rgba(10,8,30,0.28)'; x.fillRect(0, L.myTop, 360, L.fieldH);
  // 가운데 줄
  const g = x.createLinearGradient(0, L.midY, 0, L.myTop);
  g.addColorStop(0, '#2a0f24'); g.addColorStop(0.5, '#1b1636'); g.addColorStop(1, '#0f1a2e');
  x.fillStyle = g; x.fillRect(0, L.midY, 360, L.midH);
  x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(0, L.midY, 360, 1); x.fillRect(0, L.myTop - 1, 360, 1);
  // 줄 (필드 4칸)
  x.fillStyle = 'rgba(255,255,255,0.035)';
  for (const sx of [92, 210]) { x.fillRect(sx - 29, L.myTop, 58, L.fieldH); x.fillRect(360 - sx - 29, L.opTop, 58, L.fieldH); }
  x.fillStyle = '#0b0a16'; x.fillRect(0, 0, 360, L.topH); x.fillRect(0, L.myBot, 360, L.Hc - L.myBot);
  st.bg = bg ? c : null;
  return c;
}

// ─── 장면 받기 ───
function onSnap(msg) {
  if (!st.match || !msg) return;
  for (const [i, t] of msg.ty || []) st.types[i] = t; // 새로 나온 진상 종류
  const x = unpackSnap(msg.b, st.roster || [], st.types || []);
  x.ev = msg.ev || [];
  const now = performance.now();
  x.at = now;
  x.meE = x.me.es || [];
  if (x.op.es) { x.opE = x.op.es; st.opBuf.push({ at: now, e: x.opE }); if (st.opBuf.length > 3) st.opBuf.shift(); }
  // 입구가 깎이면 화면 흔들기 · 공격 표시 (쏜 수가 늘면)
  const pm = st.last;
  if (pm) {
    if (x.me.hp < pm.me.hp) { st.shake = Math.min(8, st.shake + 2 + (pm.me.hp - x.me.hp) * 0.3); st.hurt = 0.5; }
    shotsFx('me', pm.me.h, x.me.h, x.meE);
    shotsFx('op', pm.op.h, x.op.h, x.opE || (st.opBuf.length ? st.opBuf[st.opBuf.length - 1].e : []));
  }
  st.buf.push(x); if (st.buf.length > 3) st.buf.shift();
  st.last = x;
  for (const e of x.ev || []) onEv(e);
  hud(x);
}
function shotsFx(side, a, b, enemies) {
  if (!a || !b || !enemies) return;
  if (st.fx.length > 60) return;
  for (const h of b) {
    const o = a.find((q) => q[0] === h[0] && q[1] === h[1]);
    if (!o || o[8] === h[8]) continue;
    let best = null, bd = 1e9;
    for (const e of enemies) { const d = Math.abs(e.x - h[6]) + Math.abs(e.y - h[7]) * 0.5; if (e.y > -20 && d < bd) { bd = d; best = e; } }
    if (best && bd < 420) st.fx.push({ k: 'shot', side, x0: h[6], y0: h[7] - 30, x1: best.x, y1: best.y - 12, t: 0, dur: 0.14, c: (HEROES[h[1]] && HEROES[h[1]].color) || '#ffe9a8' });
  }
}
const sideOf = (s) => (s === st.side ? 'me' : 'op');
function heroPos(side, slot) {
  const x = st.last; if (!x) return null;
  const h = (side === 'me' ? x.me : x.op).h.find((q) => q[0] === slot);
  return h ? toScr(side, h[6], h[7] - 24) : null;
}
function text(side, slot, t, col, big) {
  const p = slot >= 0 ? heroPos(side, slot) : side === 'me' ? [180, st.lay.myTop + st.lay.fieldH * 0.45] : [180, st.lay.opTop + st.lay.fieldH * 0.55];
  if (!p) return;
  st.texts.push({ t: 0, dur: big ? 1.4 : 1.1, x: p[0], y: p[1] - 18, s: t, c: col || '#fff', big: !!big });
  if (st.texts.length > 14) st.texts.shift();
}
function onEv(e) {
  const L = st.lay; if (!L) return;
  const side = e.s !== undefined ? sideOf(e.s) : 'me';
  if (e.k === 'sk') { const p = heroPos(side, e.slot); if (p) st.fx.push({ k: 'ring', x: p[0], y: p[1] + 10, r0: 8, r1: 46, t: 0, dur: 0.45, c: '#ffe066' }, { k: 'icon', id: e.id, x: p[0], y: p[1] - 30, t: 0, dur: 0.8 }); if (side === 'op') text('op', e.slot, `${(HEROES[e.id] || {}).name || ''} 스킬!`, '#ffd0d8'); }
  else if (e.k === 'hex') {
    const from = heroPos(side, e.src), to = heroPos(side === 'me' ? 'op' : 'me', e.to);
    if (from && to) st.fx.push({ k: 'hex', x0: from[0], y0: from[1], x1: to[0], y1: to[1], t: 0, dur: e.fly || PV2.hexFly, c: HCOL[e.kind] || '#fff', kind: e.kind, mine: side === 'me' });
    if (side === 'op') { sfx('whoosh'); text('me', e.to, `${HEX_NAME[e.kind]} 날아온다!`, HCOL[e.kind]); }
  } else if (e.k === 'hexHit') {
    const msg = { hit: `${HEX_NAME[e.kind]}!`, guard: '방패로 막음!', imm: '면역', res: '저항!', miss: '빗나감!' }[e.r] || '';
    text(side, e.slot, msg, e.r === 'hit' ? HCOL[e.kind] : '#9fe6ff', e.r === 'hit');
    const p = heroPos(side, e.slot); if (p) st.fx.push({ k: 'burst', x: p[0], y: p[1], t: 0, dur: 0.5, c: e.r === 'hit' ? HCOL[e.kind] : '#9fe6ff' });
    if (side === 'me' && e.r === 'hit') { sfx('deny'); st.shake = Math.max(st.shake, 3); }
    if (side === 'op' && e.r === 'hit') sfx('ding');
  } else if (e.k === 'guard') { text(side, -1, '우리 팀 방패!', HCOL.guard, true); st.fx.push({ k: 'dome', side, t: 0, dur: PV2.hex.tank.sec, c: HCOL.guard }); if (side === 'me') sfx('rise'); }
  else if (e.k === 'heal') { text(side, -1, '상태이상 해제!', HCOL.cleanse, true); st.fx.push({ k: 'wash', side, t: 0, dur: 0.6, c: HCOL.cleanse }); if (side === 'me') sfx('heal'); }
  else if (e.k === 'cl') { text(side, e.slot, '정신 차려!', HCOL.cleanse); const p = heroPos(side, e.slot); if (p) st.fx.push({ k: 'ring', x: p[0], y: p[1], r0: 6, r1: 34, t: 0, dur: 0.4, c: HCOL.cleanse }); if (side === 'me') sfx('heal'); }
  else if (e.k === 'ult') { st.fx.push({ k: 'flash', side, t: 0, dur: 0.5, c: '#fff1a8' }); text(side, -1, '총공지!', '#ffe066', true); sfx(side === 'me' ? 'ult' : 'horn'); if (side === 'me') st.shake = 8; }
  else if (e.k === 'sw') { const p = heroPos(side, e.slot); if (p) st.fx.push({ k: 'burst', x: p[0], y: p[1], t: 0, dur: 0.5, c: '#ffffff' }); text(side, e.slot, `${(HEROES[e.id] || {}).name || ''} 투입!`, '#fff'); if (side === 'me') sfx('join'); }
  else if (e.k === 'send') {
    const n = e.kind === 'big' ? 1 : 3;
    for (let i = 0; i < n; i++) st.fx.push({ k: 'fly', from: side, t: -i * 0.08, dur: PV2.send.delay, x: 90 + i * 90, kind: e.kind });
    if (side === 'me') { sfx('confirm'); banner(e.auto ? '자동 중간 보스 출발!' : e.kind === 'big' ? '중간 보스 보냈다!' : `진상 ${5 * (e.n || 1)}명 보냈다!`, 'out'); }
  } else if (e.k === 'inc') {
    if (side === 'me') { if (!e.sched) { banner(e.kind === 'big' ? '중간 보스가 온다!' : `진상 ${5 * (e.n || 1)}명이 온다!`, 'in'); sfx('deny'); st.shake = Math.max(st.shake, 5); } }
  } else if (e.k === 'ph') { banner(PH_NAME[e.p] || '', 'ph', PH_SUB[e.p]); sfx(e.p >= 3 ? 'heartbeat' : 'horn'); }
  else if (e.k === 'bunch') banner('보스 묶음 출동!', 'ph', '두 사람에게 똑같이');
  else if (e.k === 'behind') { if (e.on) { text(side, -1, '추격!', '#7dffb0', true); if (side === 'me') banner('추격 모드!', 'out', '총공지 +30% · 보내기 −20% · 받는 견제 −25%'); } }
}
function banner(t, kind, sub) {
  if (!st.el) return;
  for (const o of st.el.querySelectorAll('.pv2-ban')) o.remove();
  const d = document.createElement('div');
  d.className = `pv2-ban ${kind || ''}`;
  d.innerHTML = `<b>${esc(t)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
  st.el.appendChild(d);
  setTimeout(() => d.classList.add('gone'), 1500); setTimeout(() => d.remove(), 1850);
}

// ─── HUD (장면이 올 때마다 · 1초에 10번) ───
function hud(x) {
  const el = st.el; if (!el) return;
  { const ch = el.querySelector('.pv2-ctl').offsetHeight; if (ch && Math.abs(ch - (st.ctlH || 0)) > 1) layout(); } // 조작판 높이가 바뀌면 (글꼴 · 벤치) 판 크기 다시
  const me = x.me, op = x.op;
  const pct = (s) => Math.round((s.hp / Math.max(1, s.max)) * 100);
  const door = (q, s) => { const d = el.querySelector(q); const p = pct(s); d.querySelector('i').style.width = p + '%'; d.querySelector('b').textContent = p + '%'; d.classList.toggle('low', p < 30); };
  door('.pv2-door.op', op); door('.pv2-door.me', me);
  el.querySelector('.pv2-time').textContent = pvp2LeftText(x.t);
  const ph = pvp2Phase(x.t), phe = el.querySelector('.pv2-ph');
  phe.textContent = ph ? PH_NAME[ph].replace('!', '') : `W${me.w}`; phe.className = `pv2-ph p${ph}`;
  el.querySelector('.pv2-k').textContent = `처치 ${me.k} : ${op.k}`;
  el.querySelector('.pv2-tags').innerHTML = `${me.bh ? '<i class="tg cb">추격</i>' : ''}${me.gu ? '<i class="tg gu">방패</i>' : ''}${op.bh ? '<i class="tg ocb">상대 추격</i>' : ''}`;
  // 기세 (스킬 하나 = 100 · 최대 200)
  const mo = el.querySelectorAll('.pv2-mom i');
  if (me.m >= 0) { mo[0].style.setProperty('--f', clamp(me.m / 100, 0, 1)); mo[1].style.setProperty('--f', clamp((me.m - 100) / 100, 0, 1)); }
  // 스킬 버튼 (필드 4명)
  const sk = el.querySelector('.pv2-sk');
  const key = me.h.map((h) => h[0] + h[1]).join(',') + '|' + st.swapPick;
  if (sk.dataset.k !== key) {
    sk.dataset.k = key;
    sk.innerHTML = me.h.slice().sort((a, b) => a[0] - b[0]).map((h) => `<button class="pv2-s ${st.swapPick >= 0 ? 'pick' : ''}" data-p2="sk" data-s="${h[0]}"><img src="${esc((HEROES[h[1]] || {}).img || '')}" alt="" draggable="false"><i class="cd"></i><em class="lv"></em><span class="stt"></span><b class="nm">${esc(((HEROES[h[1]] || {}).name || '').slice(0, 4))}</b>${st.swapPick >= 0 ? '<u>교체</u>' : ''}</button>`).join('');
  }
  for (const h of me.h) {
    const b = sk.querySelector(`[data-s="${h[0]}"]`); if (!b) continue;
    const bits = h[4];
    b.style.setProperty('--cd', h[3] / 100);
    b.classList.toggle('ready', !!(bits & ST.ready) && !(bits & (ST.stun | ST.charm | ST.silence)) && me.m >= 100);
    b.classList.toggle('bound', !!(bits & (ST.stun | ST.charm | ST.silence)));
    b.querySelector('.lv').textContent = 'Lv' + h[2];
    const s = bits & ST.stun ? ['기절', 'stun'] : bits & ST.charm ? ['홀림', 'charm'] : bits & ST.silence ? ['침묵', 'silence'] : bits & ST.slow ? ['둔화', 'slow'] : bits & ST.imm ? ['면역', 'imm'] : null;
    const se = b.querySelector('.stt'); se.textContent = s ? s[0] : ''; se.className = `stt ${s ? s[1] : ''}`;
  }
  // 벤치 (교체)
  const bn = el.querySelector('.pv2-bench');
  const bk = me.bench.join(',') + '|' + st.swapPick;
  if (bn.dataset.k !== bk) {
    bn.dataset.k = bk;
    bn.innerHTML = me.bench.length ? me.bench.map((id, i) => `<button class="pv2-bn ${st.swapPick === i ? 'on' : ''}" data-p2="bn" data-b="${i}"><img src="${esc((HEROES[id] || {}).img || '')}" alt="" draggable="false"><small>${st.swapPick === i ? '누구랑?' : '교체'}</small></button>`).join('') : '<span class="pv2-nob">벤치 없음<br><small>덱 5~6명이면 교체 가능</small></span>';
  }
  bn.style.setProperty('--cd', me.sw > 0 ? me.sw / (PV2.swapCd * 10) : 0);
  bn.classList.toggle('cool', me.sw > 0);
  const cl = el.querySelector('.pv2-b.cl');
  cl.style.setProperty('--cd', me.cl > 0 ? me.cl / (PV2.cleanseCd * 10) : 0);
  cl.classList.toggle('cool', me.cl > 0);
  cl.classList.toggle('hot', me.cl <= 0 && me.h.some((h) => h[4] & (ST.stun | ST.charm | ST.silence | ST.slow)));
  const cost = (k) => Math.round(PV2.send[k].cost * (me.bh ? PV2.comeback.send : 1));
  const sb = el.querySelector('.pv2-b.send');
  const big = me.ga >= cost('big');
  sb.querySelector('small').textContent = big ? `${cost('big')}/${cost('big')}` : `${Math.min(me.ga, cost('small'))}/${cost('small')}`;
  sb.classList.toggle('ready', me.ga >= cost('small')); sb.classList.toggle('big', big);
  sb.querySelector('span').textContent = big ? '중간 보스' : '보내기';
  const ub = el.querySelector('.pv2-b.ult');
  ub.style.setProperty('--f', clamp(me.u / 100, 0, 1));
  ub.classList.toggle('ready', me.u >= 100 && me.m >= 200);
}

// ─── 누르기 ───
function send(q, btn) {
  if (!st.sock || !st.match) return;
  if (btn) { btn.classList.remove('press'); void btn.offsetWidth; btn.classList.add('press'); }
  st.sock.emit('in', q, (r) => { if (r && !r.ok && r.msg && btn) tip(btn, r.msg); });
}
function tip(btn, msg) {
  const r = btn.getBoundingClientRect(), sr = st.el.getBoundingClientRect();
  const t = document.createElement('span');
  t.className = 'pv2-tip'; t.textContent = msg;
  t.style.left = `${r.left - sr.left + r.width / 2}px`; t.style.top = `${r.top - sr.top - 6}px`;
  st.el.appendChild(t); setTimeout(() => t.remove(), 900);
}
function onClick(ev) {
  const b = ev.target.closest('[data-p2]'); if (!b) return;
  if (C.A && C.A.unlock) C.A.unlock();
  const k = b.dataset.p2, x = st.last;
  if (k === 'quit') { quitAsk(); return; }
  if (!x) return;
  if (k === 'bn') { const i = Number(b.dataset.b); if (x.me.sw > 0) { tip(b, '교체 쿨'); return; } st.swapPick = st.swapPick === i ? -1 : i; sfx('tap'); hud(x); return; }
  if (k === 'sk') return; // 스킬 버튼은 누르기 · 끌기(skDown/skMove/skUp)에서
  if (k === 'cl') { send({ k: 'cl' }, b); return; }
  if (k === 'ult') { send({ k: 'ult' }, b); return; }
  if (k === 'send') { const big = x.me.ga >= Math.round(PV2.send.big.cost * (x.me.bh ? PV2.comeback.send : 1)); send({ k: 'send', kind: big ? 'big' : 'small' }, b); }
}
// 스킬 버튼: 누르면 자동 조준 · 끌어서 내 판에 놓으면 그곳에 (끌다가 판 밖에서 놓으면 취소)
function skTap(b) {
  const x = st.last; if (!x) return;
  const s = Number(b.dataset.s);
  if (st.swapPick >= 0) { const bi = st.swapPick; st.swapPick = -1; send({ k: 'sw', b: bi, s }, b); hud(x); return; }
  send({ k: 'sk', s }, b);
}
function aimAt(ev) {
  const L = st.lay, r = st.cv.getBoundingClientRect();
  const lx = ((ev.clientX - r.left) / r.width) * 360, ly = ((ev.clientY - r.top) / r.height) * L.Hc;
  const inside = lx >= 0 && lx <= 360 && ly >= L.myTop && ly < L.myBot;
  return { lx, ly, inside, x: clamp(lx, 0, 360), y: Y0 + ((ly - L.myTop) / L.fieldH) * (Y1 - Y0) };
}
function skDown(ev) {
  const b = ev.target.closest('.pv2-s'); if (!b || !st.last) return;
  if (C.A && C.A.unlock) C.A.unlock();
  st.drag = { b, s: Number(b.dataset.s), x0: ev.clientX, y0: ev.clientY, on: false, aim: null, id: ev.pointerId };
  try { b.setPointerCapture(ev.pointerId); } catch { /* 없어도 됨 */ }
}
function skMove(ev) {
  const d = st.drag; if (!d || ev.pointerId !== d.id || !st.lay) return;
  if (!d.on && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) > 14 && st.swapPick < 0) { d.on = true; d.b.classList.add('aiming'); }
  if (d.on) d.aim = aimAt(ev);
}
function skUp(ev) {
  const d = st.drag; if (!d || ev.pointerId !== d.id) return;
  st.drag = null; d.b.classList.remove('aiming');
  if (ev.type === 'pointercancel') return;
  if (!d.on) { skTap(d.b); return; }
  const a = aimAt(ev);
  if (!a.inside) { tip(d.b, '조준 취소'); return; }
  send({ k: 'sk', s: d.s, x: Math.round(a.x), y: Math.round(a.y) }, d.b);
  st.fx.push({ k: 'ring', x: a.lx, y: a.ly, r0: 6, r1: 30, t: 0, dur: 0.35, c: '#ffe066' });
}
// 끄는 동안: 놓을 곳에 범위 표시 (그 멤버 스킬 범위 · 판 밖이면 빨간 X)
function drawAim(now) {
  const d = st.drag; if (!d || !d.on || !d.aim) return;
  const cx = st.cx, L = st.lay, a = d.aim;
  const h = st.last && st.last.me.h.find((q) => q[0] === d.s);
  const sk = h && HEROES[h[1]] && HEROES[h[1]].skill;
  const r = sk && sk.r ? sk.r[Math.max(0, Math.min(sk.r.length - 1, h[2] - 1))] : 60;
  if (!a.inside) { cx.strokeStyle = '#ff4d6d'; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(a.lx - 10, a.ly - 10); cx.lineTo(a.lx + 10, a.ly + 10); cx.moveTo(a.lx + 10, a.ly - 10); cx.lineTo(a.lx - 10, a.ly + 10); cx.stroke(); return; }
  const ry = r * (L.fieldH / (Y1 - Y0));
  if (h) { const p = toScr('me', h[6], h[7] - 20); cx.strokeStyle = 'rgba(255,224,102,0.45)'; cx.setLineDash([5, 5]); cx.lineWidth = 2; cx.beginPath(); cx.moveTo(p[0], p[1]); cx.lineTo(a.lx, a.ly); cx.stroke(); cx.setLineDash([]); }
  cx.fillStyle = 'rgba(255,224,102,0.16)'; cx.strokeStyle = '#ffe066'; cx.lineWidth = 2;
  cx.beginPath(); cx.ellipse(a.lx, a.ly, r, Math.max(10, ry), 0, 0, Math.PI * 2); cx.fill(); cx.stroke();
  cx.beginPath(); cx.arc(a.lx, a.ly, 4 + Math.sin(now / 120), 0, Math.PI * 2); cx.fillStyle = '#ffe066'; cx.fill();
}
// 화면 누르기: 상대 멤버 → 견제 표적 (다시 누르면 자동) · 내 판 → 집중 공격
function onTap(ev) {
  const L = st.lay, x = st.last; if (!L || !x) return;
  const r = st.cv.getBoundingClientRect();
  const lx = ((ev.clientX - r.left) / r.width) * 360, ly = ((ev.clientY - r.top) / r.height) * L.Hc;
  if (ly >= L.opTop && ly < L.midY) {
    let best = null, bd = 44;
    for (const h of x.op.h) { const p = toScr('op', h[6], h[7] - 20); const d = Math.hypot(p[0] - lx, p[1] - ly); if (d < bd) { bd = d; best = h; } }
    if (best) { const s = x.me.tg === best[0] ? -1 : best[0]; send({ k: 'tg', s }); x.me.tg = s; sfx('tap'); if (s >= 0) text('op', s, '여기 노려!', '#ff8fa3'); else text('op', -1, '자동 조준', '#ccc'); }
    return;
  }
  if (ly >= L.myTop && ly < L.myBot) {
    const y = Y0 + ((ly - L.myTop) / L.fieldH) * (Y1 - Y0);
    send({ k: 'fo', x: lx, y });
    st.fx.push({ k: 'ring', x: lx, y: ly, r0: 4, r1: 18, t: 0, dur: 0.3, c: '#ff6b6b' });
  }
}
async function quitAsk() {
  const ok = C.confirmBox ? await C.confirmBox({ title: '기권할까요?', sub: '기권하면 패배로 기록돼요', ok: '기권', cancel: '계속', danger: true }) : true;
  if (ok && st.sock && st.match) st.sock.emit('quit');
}

// ─── 그리기 (60fps) ───
function lerpList(prev, last, a) {
  if (!last) return [];
  if (!prev || a >= 1) return last;
  const m = new Map(); for (const e of prev) m.set(e.uid, e);
  const out = [];
  for (const e of last) { const p = m.get(e.uid); out.push(p && Math.abs(p.y - e.y) < 120 ? { uid: e.uid, t: e.t, x: p.x + (e.x - p.x) * a, y: p.y + (e.y - p.y) * a, hp: e.hp, f: e.f } : e); }
  return out;
}
function draw(now, dt) {
  const cx = st.cx, L = st.lay; if (!cx || !L) return;
  const k = L.k * L.dpr;
  cx.setTransform(k, 0, 0, k, 0, 0);
  if (!st.bg) bakeBg();
  let ox = 0, oy = 0;
  if (st.shake > 0) { st.shake = Math.max(0, st.shake - dt * 30); ox = (Math.random() - 0.5) * st.shake; oy = (Math.random() - 0.5) * st.shake; }
  if (st.bg) { cx.setTransform(1, 0, 0, 1, 0, 0); cx.drawImage(st.bg, 0, 0); cx.setTransform(k, 0, 0, k, ox * k, oy * k); } else { cx.fillStyle = '#120f22'; cx.fillRect(0, 0, 360, L.Hc); }
  const b = st.buf, last = b[b.length - 1], prev = b[b.length - 2];
  if (!last) { cx.fillStyle = '#fff'; cx.font = '700 15px Pretendard Variable, sans-serif'; cx.textAlign = 'center'; cx.fillText('곧 시작해요…', 180, L.Hc / 2); return; }
  const span = prev ? Math.max(40, last.at - prev.at) : 100;
  const a = prev ? clamp((now - last.at) / span, 0, 1) : 1;
  const meE = lerpList(prev && prev.meE, last.meE, a);
  const ob = st.opBuf, oL = ob[ob.length - 1], oP = ob[ob.length - 2];
  const opE = oL ? lerpList(oP && oP.e, oL.e, oP ? clamp((now - oL.at) / Math.max(60, oL.at - oP.at), 0, 1) : 1) : [];
  drawDoor('me', last.me); drawDoor('op', last.op);
  drawEnemies('op', opE); drawHeroes('op', last.op, prev && prev.op, a, now);
  drawEnemies('me', meE); drawHeroes('me', last.me, prev && prev.me, a, now);
  drawTarget(last, now);
  drawAim(now);
  drawFx(dt);
  if (st.hurt > 0) { st.hurt -= dt; cx.fillStyle = `rgba(255,40,60,${(st.hurt * 0.5).toFixed(3)})`; cx.fillRect(0, L.myTop, 360, L.fieldH); }
}
function drawDoor(side, s) {
  const cx = st.cx, L = st.lay;
  const p = s.hp / Math.max(1, s.max);
  const [, y] = toScr(side, 0, 510);
  cx.fillStyle = 'rgba(0,0,0,0.35)'; cx.fillRect(0, y - 2, 360, 4);
  cx.fillStyle = p < 0.3 ? '#ff3b4e' : side === 'me' ? '#5be37a' : '#ff8f6b';
  cx.fillRect(180 - 180 * p, y - 1.5, 360 * p, 3);
  void L;
}
function drawEnemies(side, list) {
  const cx = st.cx;
  const arr = list.slice().sort((p, q) => (side === 'me' ? p.y - q.y : q.y - p.y));
  for (const e of arr) {
    const def = ENEMIES[e.t];
    const [x, y] = toScr(side, e.x, e.y);
    const sz = clamp((def ? def.size : 60) * 0.42, 20, 72);
    const img = def ? im(def.img) : null;
    const top = y - sz * 0.85;
    if (e.f & 4) { cx.fillStyle = 'rgba(199,125,255,0.35)'; cx.beginPath(); cx.ellipse(x, y, sz * 0.38, sz * 0.14, 0, 0, Math.PI * 2); cx.fill(); }
    if (img) cx.drawImage(img, x - sz / 2, top, sz, sz);
    else { cx.fillStyle = e.f & 1 ? '#ff9f43' : e.f & 2 ? '#ffd23f' : '#ff6b6b'; cx.beginPath(); cx.arc(x, y - sz * 0.4, sz * 0.3, 0, Math.PI * 2); cx.fill(); }
    if (e.f & 16) { cx.fillStyle = '#ffe066'; cx.fillRect(x - 3, top - 4, 6, 3); }
    if (e.hp < 0.999 || e.f & 3) {
      const w = e.f & 1 ? sz * 0.9 : sz * 0.6, h = e.f & 1 ? 4 : 2.5;
      cx.fillStyle = 'rgba(0,0,0,0.6)'; cx.fillRect(x - w / 2, top - 2, w, h);
      cx.fillStyle = e.f & 1 ? '#ff4d6d' : e.f & 2 ? '#ffb02e' : '#ff7b7b'; cx.fillRect(x - w / 2, top - 2, w * clamp(e.hp, 0, 1), h);
    }
    if (e.f & 8) { cx.strokeStyle = '#ff6b6b'; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(x, y - sz * 0.4, sz * 0.5, 0, Math.PI * 2); cx.stroke(); }
  }
}
function drawHeroes(side, s, ps, a, now) {
  const cx = st.cx;
  const hs = s.h.slice().sort((p, q) => (side === 'me' ? p[7] - q[7] : q[7] - p[7]));
  for (const h of hs) {
    const def = HEROES[h[1]]; if (!def) continue;
    const ph = ps && ps.h.find((q) => q[0] === h[0] && q[1] === h[1]);
    const hx = ph ? ph[6] + (h[6] - ph[6]) * a : h[6], hy = ph ? ph[7] + (h[7] - ph[7]) * a : h[7];
    const [x, y] = toScr(side, hx, hy);
    const bits = h[4], bound = bits & (ST.stun | ST.charm);
    const sz = 46;
    // 발밑: 스킬 준비 빛 · 면역 · 방패
    if (bits & ST.ready && !bound) { cx.fillStyle = 'rgba(255,224,102,0.35)'; cx.beginPath(); cx.ellipse(x, y + 2, 20 + Math.sin(now / 160) * 2, 6, 0, 0, Math.PI * 2); cx.fill(); }
    else { cx.fillStyle = 'rgba(0,0,0,0.35)'; cx.beginPath(); cx.ellipse(x, y + 2, 17, 5, 0, 0, Math.PI * 2); cx.fill(); }
    const img = im(def.img);
    const bob = bound ? 0 : Math.sin(now / 300 + h[0]) * 1.2;
    cx.save();
    if (bits & ST.stun) { cx.translate(x, y); cx.rotate(Math.sin(now / 90) * 0.08); cx.translate(-x, -y); }
    if (bound) cx.globalAlpha = 0.75;
    if (img) cx.drawImage(img, x - sz / 2, y - sz + bob, sz, sz);
    else { cx.fillStyle = def.color || '#fff'; cx.beginPath(); cx.arc(x, y - sz / 2, sz * 0.35, 0, Math.PI * 2); cx.fill(); }
    cx.restore();
    if (bits & ST.imm) { cx.strokeStyle = 'rgba(255,255,255,0.7)'; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(x, y - sz / 2, sz * 0.52, 0, Math.PI * 2); cx.stroke(); }
    if (bits & ST.guard) { cx.strokeStyle = 'rgba(95,208,255,0.85)'; cx.lineWidth = 2; cx.beginPath(); cx.arc(x, y - sz / 2, sz * 0.58, Math.PI, Math.PI * 2); cx.stroke(); }
    // 머리 위: 상태이상 아이콘 (그림 대신 또렷한 도형)
    const iy = y - sz - 7;
    if (bits & ST.stun) { for (let i = 0; i < 3; i++) { const t = now / 260 + (i * Math.PI * 2) / 3; star(x + Math.cos(t) * 11, iy + Math.sin(t) * 3, 4, HCOL.stun); } }
    else if (bits & ST.charm) heart(x, iy, 6, HCOL.charm);
    else if (bits & ST.silence) mute(x, iy, 7, HCOL.silence);
    if (bits & ST.slow) { cx.fillStyle = HCOL.slow; cx.font = '900 9px Pretendard Variable, sans-serif'; cx.textAlign = 'center'; cx.fillText('느림', x + 16, y - sz + 8); }
    // 레벨
    cx.fillStyle = 'rgba(10,8,22,0.8)'; cx.fillRect(x - 11, y - 1, 22, 10);
    cx.fillStyle = side === 'me' ? '#9fe6ff' : '#ffb3c1'; cx.font = '800 8px Pretendard Variable, sans-serif'; cx.textAlign = 'center'; cx.fillText('Lv' + h[2], x, y + 7);
  }
}
function star(x, y, r, c) { const cx = st.cx; cx.fillStyle = c; cx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; cx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } cx.closePath(); cx.fill(); }
function heart(x, y, r, c) { const cx = st.cx; cx.fillStyle = c; cx.beginPath(); cx.moveTo(x, y + r * 0.9); cx.bezierCurveTo(x - r * 1.4, y - r * 0.2, x - r * 0.5, y - r * 1.2, x, y - r * 0.35); cx.bezierCurveTo(x + r * 0.5, y - r * 1.2, x + r * 1.4, y - r * 0.2, x, y + r * 0.9); cx.fill(); }
function mute(x, y, r, c) { const cx = st.cx; cx.fillStyle = c; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill(); cx.strokeStyle = '#fff'; cx.lineWidth = 1.6; cx.beginPath(); cx.moveTo(x - r * 0.45, y - r * 0.45); cx.lineTo(x + r * 0.45, y + r * 0.45); cx.moveTo(x + r * 0.45, y - r * 0.45); cx.lineTo(x - r * 0.45, y + r * 0.45); cx.stroke(); }
// 견제 표적 (상대 멤버): 고른 멤버는 빨간 조준 · 자동이면 흐린 점선
function drawTarget(x, now) {
  const cx = st.cx;
  const tg = x.me.tg;
  const h = tg >= 0 ? x.op.h.find((q) => q[0] === tg) : null;
  if (!h) return;
  const [px, py] = toScr('op', h[6], h[7] - 23);
  const r = 26 + Math.sin(now / 200) * 2;
  cx.strokeStyle = '#ff4d6d'; cx.lineWidth = 2;
  cx.beginPath(); cx.arc(px, py, r, 0, Math.PI * 2); cx.stroke();
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; cx.beginPath(); cx.moveTo(px + Math.cos(a) * (r - 6), py + Math.sin(a) * (r - 6)); cx.lineTo(px + Math.cos(a) * (r + 5), py + Math.sin(a) * (r + 5)); cx.stroke(); }
}
function drawFx(dt) {
  const cx = st.cx, L = st.lay;
  const keep = [];
  for (const f of st.fx) {
    f.t += dt;
    if (f.t < 0) { keep.push(f); continue; }
    const p = f.t / f.dur;
    if (p >= 1) continue;
    keep.push(f);
    if (f.k === 'shot') { cx.strokeStyle = f.c; cx.globalAlpha = 1 - p; cx.lineWidth = 1.6; const [x0, y0] = toScr(f.side, f.x0, f.y0), [x1, y1] = toScr(f.side, f.x1, f.y1); cx.beginPath(); cx.moveTo(x0 + (x1 - x0) * p * 0.6, y0 + (y1 - y0) * p * 0.6); cx.lineTo(x0 + (x1 - x0) * Math.min(1, p + 0.4), y0 + (y1 - y0) * Math.min(1, p + 0.4)); cx.stroke(); cx.globalAlpha = 1; }
    else if (f.k === 'ring') { cx.strokeStyle = f.c; cx.globalAlpha = 1 - p; cx.lineWidth = 3 * (1 - p) + 1; cx.beginPath(); cx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * p, 0, Math.PI * 2); cx.stroke(); cx.globalAlpha = 1; }
    else if (f.k === 'burst') { cx.fillStyle = f.c; cx.globalAlpha = (1 - p) * 0.8; for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, d = 6 + 22 * p; cx.beginPath(); cx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, 2.6 * (1 - p) + 0.6, 0, Math.PI * 2); cx.fill(); } cx.globalAlpha = 1; }
    else if (f.k === 'icon') { const img = im(`/img/lb/ui2/sk_${f.id}.webp`); if (img) { const s = 26 + 10 * Math.sin(Math.min(1, p * 2) * Math.PI * 0.5); cx.globalAlpha = p > 0.7 ? (1 - p) / 0.3 : 1; cx.drawImage(img, f.x - s / 2, f.y - s / 2 - p * 10, s, s); cx.globalAlpha = 1; } }
    else if (f.k === 'hex') {
      // 가운데 줄을 넘어가는 견제 구슬 (곡선 · 꼬리)
      const mx = (f.x0 + f.x1) / 2 + (f.mine ? 40 : -40), my = L.midY + L.midH / 2;
      const at = (q) => { const u = 1 - q; return [u * u * f.x0 + 2 * u * q * mx + q * q * f.x1, u * u * f.y0 + 2 * u * q * my + q * q * f.y1]; };
      for (let i = 4; i >= 0; i--) { const q = Math.max(0, p - i * 0.05); const [x, y] = at(q); cx.globalAlpha = i ? 0.18 * (5 - i) / 5 : 1; cx.fillStyle = i ? f.c : '#fff'; cx.beginPath(); cx.arc(x, y, i ? 6 - i : 4, 0, Math.PI * 2); cx.fill(); }
      const [x, y] = at(p); cx.globalAlpha = 0.9; cx.strokeStyle = f.c; cx.lineWidth = 2.5; cx.beginPath(); cx.arc(x, y, 7, 0, Math.PI * 2); cx.stroke(); cx.globalAlpha = 1;
    } else if (f.k === 'dome') { if (st.last && (f.side === 'me' ? !st.last.me.gu : !st.last.op.gu) && f.t > 0.3) continue; const [, y] = toScr(f.side, 0, 554); cx.strokeStyle = f.c; cx.globalAlpha = 0.35 + 0.15 * Math.sin(f.t * 6); cx.lineWidth = 2; cx.beginPath(); cx.ellipse(180, y - 10, 150, 26, 0, 0, Math.PI * 2); cx.stroke(); cx.globalAlpha = 1; }
    else if (f.k === 'wash') { const top = f.side === 'me' ? L.myTop : L.opTop; cx.fillStyle = f.c; cx.globalAlpha = 0.18 * (1 - p); cx.fillRect(0, top, 360, L.fieldH); cx.globalAlpha = 1; }
    else if (f.k === 'flash') { const top = f.side === 'me' ? L.myTop : L.opTop; cx.fillStyle = f.c; cx.globalAlpha = 0.45 * (1 - p); cx.fillRect(0, top, 360, L.fieldH); cx.globalAlpha = 1; }
    else if (f.k === 'fly') {
      // 보낸 진상: 보낸 쪽 판 가운데 → 가운데 줄 → 받는 쪽 판 위로
      const y0 = f.from === 'me' ? L.myTop + L.fieldH * 0.5 : L.opTop + L.fieldH * 0.5, y1 = f.from === 'me' ? L.opTop + L.fieldH * 0.7 : L.myTop + L.fieldH * 0.3;
      const y = y0 + (y1 - y0) * p, x = f.x + Math.sin(p * Math.PI * 2) * 8;
      const def = ENEMIES[f.kind === 'big' ? 'mid_drunk' : 'mukti'], img = def ? im(def.img) : null, s = f.kind === 'big' ? 34 : 22;
      cx.globalAlpha = 0.9; if (img) cx.drawImage(img, x - s / 2, y - s / 2, s, s); else { cx.fillStyle = '#c77dff'; cx.beginPath(); cx.arc(x, y, 6, 0, Math.PI * 2); cx.fill(); } cx.globalAlpha = 1;
    }
  }
  st.fx = keep;
  // 떠오르는 글자 (진하게 · 테두리 대신 그림자)
  const tk = [];
  for (const t of st.texts) {
    t.t += dt; const p = t.t / t.dur; if (p >= 1) continue; tk.push(t);
    cx.globalAlpha = p > 0.75 ? (1 - p) / 0.25 : 1;
    cx.font = `900 ${t.big ? 15 : 11}px Pretendard Variable, sans-serif`; cx.textAlign = 'center';
    const y = t.y - p * 16;
    cx.fillStyle = 'rgba(0,0,0,0.75)'; cx.fillText(t.s, t.x + 1, y + 1.2);
    cx.fillStyle = t.c; cx.fillText(t.s, t.x, y);
    cx.globalAlpha = 1;
  }
  st.texts = tk;
}

// ─── 끝 ───
function onEnd(r) {
  if (r && r.id && st.match && r.id !== st.match.id) { if (C.resync) C.resync(); return; }
  if (!st.match && !st.el) { if (C.resync) C.resync(); return; }
  st.ended = r; st.match = null;
  const el = st.el;
  if (!el) { if (C.resync) C.resync(); return; }
  const why = { dead: r.win ? '상대 입구가 무너졌어요!' : '입구가 무너졌어요', time: r.draw ? '4분 끝 · 입구도 처치도 같았어요' : `4분 끝 · 입구 ${r.hp}% 대 ${r.oppHp}%`, quit: r.win ? '상대가 기권했어요' : '기권했어요', forfeit: r.win ? '상대 연결이 끊겼어요' : '연결이 끊겨 기권 처리됐어요', error: '서버 문제로 판이 멈췄어요 (점수 변동 없음)' }[r.reason] || '';
  const res = document.createElement('div');
  res.className = `pv2-res ${r.draw ? 'draw' : r.win ? 'win' : 'lose'}`;
  res.innerHTML = `<div class="pr-box"><b class="pr-t">${r.draw ? '무승부' : r.win ? '승리!' : '패배'}</b><small class="pr-why">${esc(why)}</small>
    <div class="pr-vs"><span><small>내 입구</small><b>${r.hp | 0}%</b><em>처치 ${r.kills | 0}</em></span><i>VS</i><span><small>상대 입구</small><b>${r.oppHp | 0}%</b><em>처치 ${r.oppKills | 0}</em></span></div>
    ${r.ranked ? `<div class="pr-rt">${C.tierEmb(r.rating, 'mid')}<b>${r.rating}</b><em class="${r.delta >= 0 ? 'up' : 'dn'}">${r.delta >= 0 ? '+' : ''}${r.delta}</em></div>` : `<p class="pr-note">${r.ai ? '' : '연습 판 · '}점수 변동 없음</p>`}
    ${r.coins ? `<p class="pr-coin">코인 +${r.coins}</p>` : ''}${r.note ? `<p class="pr-note">${esc(r.note)}</p>` : ''}
    <div class="pr-btns"><button class="btn primary" data-r="again">다시 대전</button><button class="btn ghost" data-r="out">나가기</button></div></div>`;
  el.appendChild(res);
  sfx(r.win ? 'win' : r.draw ? 'ding' : 'lose');
  res.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-r]'); if (!b) return;
    closeScreen();
    if (b.dataset.r === 'again') queue(); else if (C.showLobby) C.showLobby();
  });
  if (C.resync) C.resync();
}

const ACTS = {
  pv2Queue: () => queue(), pv2Bot: () => botNow(), pv2Room: () => room(false), pv2Join: () => room(true),
};
