'use strict';
// 테스트용 자동 플레이어(봇).
//   node scripts/bots.js            → 새 방을 만들고 봇 3명을 앉힘. 내가 들어갈 링크를 출력
//   node scripts/bots.js ABC123 2   → 이미 있는 방 ABC123에 봇 2명 참가
//   node scripts/bots.js --start 4  → 새 방 + 봇 + 나(자리만) 만들고 바로 시작 (화면 확인용)
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3000';
const args = process.argv.slice(2);
const autostart = args.includes('--start');
const pos = args.filter((a) => !a.startsWith('--'));
const NAMES = ['철수봇', '영희봇', '민수봇', '지현봇', '태오봇', '하나봇', '도윤봇', '서아봇'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function mk() {
  const s = io(URL, { transports: ['websocket'] });
  s.call = (ev, d) => new Promise((r) => s.emit(ev, d || {}, r));
  return s;
}

function brain(s, name) {
  let acting = false;
  s.on('state', async (st) => {
    const la = st.hand && st.hand.legal;
    if (st.me && st.me.canRebuy && st.me.stack === 0) s.call('game:rebuy');
    if (st.me && st.me.sittingOut) s.call('game:sitin');
    if (!la || acting) return;
    acting = true;
    await wait(700 + Math.random() * 1300);
    const r = Math.random();
    let a;
    if (la.canCheck) a = r < 0.2 && (la.canBet || la.canRaise) ? { type: la.canBet ? 'bet' : 'raise', amount: la.minTo } : { type: 'check' };
    else if (r < 0.15) a = { type: 'fold' };
    else if (r < 0.25 && la.canRaise) a = { type: 'raise', amount: la.minTo };
    else if (r < 0.28 && la.canAllIn) a = { type: 'allin' };
    else a = { type: 'call' };
    const res = await s.call('game:act', a);
    if (!res.ok) await s.call('game:act', { type: la.canCheck ? 'check' : 'fold' });
    acting = false;
  });
}

(async () => {
  const numeric = pos[0] && /^\d+$/.test(pos[0]);
  let code = numeric ? null : pos[0];
  const count = Number(numeric ? pos[0] : pos[1]) || 3;
  let human = null;
  if (!code) {
    const host = mk();
    const r = await host.call('room:create', { name: autostart ? '나' : '방장봇', settings: { startChips: 1000, sb: 10, bb: 20, turnSeconds: 30 } });
    if (!r.ok) { console.error(r.message); process.exit(1); }
    code = r.code;
    if (autostart) { human = r; host.close(); } else brain(host, '방장봇');
  }
  const bots = [];
  for (let i = 0; i < count; i++) {
    const s = mk();
    const r = await s.call('room:join', { code, name: NAMES[i % NAMES.length] });
    if (!r.ok) { console.error(r.message); continue; }
    await s.call('lobby:ready', { ready: true });
    brain(s, NAMES[i]);
    bots.push(s);
  }
  console.log(`방 코드: ${code}`);
  console.log(`참가 링크: ${URL}/r/${code}`);
  if (human) {
    const h = mk();
    await h.call('room:resume', { code, token: human.token });
    const st = await h.call('lobby:start');
    if (!st.ok) console.error(st.message);
    h.close();
    console.log(`내 화면(방장 '나'): ${URL}/r/${code}?t=${encodeURIComponent(human.token)}&p=${human.playerId}`);
  }
  console.log('봇이 자동으로 플레이 중이에요. 끄려면 Ctrl + C');
})();
