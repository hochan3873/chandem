// 랑방 대전 — Web Audio 합성 효과음 + 배경음악
// 첫 터치 때 AudioContext 를 연다(모바일 자동재생 정책). 음소거는 localStorage 에 기억.

const LS_KEY = 'langbang:mute';
// 음량 (0~1): 배경음 · 효과음 따로 — 설정 화면 막대
let VOLS = { bgm: 1, sfx: 1 };
try { VOLS = Object.assign(VOLS, JSON.parse(localStorage.getItem('langbang:vol') || '{}')); } catch { /* 무시 */ }
export function getVol(k) { return VOLS[k]; }
export function setVol(k, v) { VOLS[k] = Math.max(0, Math.min(1, +v || 0)); try { localStorage.setItem('langbang:vol', JSON.stringify(VOLS)); } catch { /* 무시 */ } if (master) master.gain.value = muted ? 0 : 0.55 * VOLS.sfx; if (curKey && players[curKey]) players[curKey].volume = VOL * VOLS.bgm; }
let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem(LS_KEY) === '1'; } catch { /* 저장소 막힘 */ }
const last = new Map(); // 효과음별 마지막 재생 시각 (너무 잦은 재생 방지)

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55 * VOLS.sfx;
    // 살짝 눌러 주는 컴프레서 — 여러 소리가 겹쳐도 찢어지지 않게
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 0.5;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function isMuted() { return muted; }
export function setMuted(v) {
  muted = !!v;
  try { localStorage.setItem(LS_KEY, muted ? '1' : '0'); } catch { /* 무시 */ }
  if (master) master.gain.value = muted ? 0 : 0.55 * VOLS.sfx;
  if (muted) { for (const a of Object.values(players)) a.pause(); curKey = null; } else if (playing) { curKey = null; playBgm(); }
}

// 배경음악: 챕터마다 다른 곡 + 보스 웨이브 곡 (필요할 때만 불러온다). 바꿀 때는 부드럽게 겹쳐서
const TRACKS = {
  1: '/sounds/bgm_langbang.mp3', 2: '/sounds/bgm_lb2.mp3', 3: '/sounds/bgm_lb3.mp3',
  4: '/sounds/bgm_lb4.mp3', 5: '/sounds/bgm_lb5.mp3', 6: '/sounds/bgm_lb6.mp3', 7: '/sounds/bgm_lb7.mp3', boss: '/sounds/bgm_lb_boss.mp3', // (7장 스키장: 전용 곡이 오기 전까진 연말 눈 곡)
  raid: '/sounds/bgm_lb_raid.mp3', pvp: '/sounds/bgm_lb_pvp.mp3', // 레이드 · 1:1 대전 전용 곡 (없으면 챕터 곡 그대로)
  tower: '/sounds/bgm_lb_tower.mp3', // 진상의 탑 (로비 · 전투)
};
const OPTIONAL = new Set(['raid', 'pvp', 'tower']); // 서버 파일 목록에 없으면 요청도 안 한다
const VOL = 0.4;
const players = {};
const bad = {};
let playing = false, want = 1, bossOn = false, curKey = null, modeKey = null, avail = null;
function player(key) {
  if (bad[key] || !TRACKS[key]) return null;
  if (OPTIONAL.has(key) && avail && !avail.has(TRACKS[key])) { bad[key] = true; return null; }
  if (!players[key]) {
    const a = new Audio(TRACKS[key]);
    a.loop = true; a.volume = 0; a.preload = 'auto';
    a.addEventListener('error', () => { bad[key] = true; if (curKey === key) { curKey = null; if (playing && !muted) switchTo(target()); } });
    players[key] = a;
  }
  return players[key];
}
let fadeT = 0;
function switchTo(key) {
  if (bad[key]) key = bad[want] ? 1 : want;
  if (bad[key]) return;
  let next = player(key);
  if (!next && key !== want && !bad[want]) { key = want; next = player(key); } // 모드 곡이 없으면 챕터 곡
  if (!next) return;
  const prev = curKey && curKey !== key ? players[curKey] : null;
  curKey = key;
  const p = next.play();
  if (p && p.catch) p.catch(() => {});
  clearInterval(fadeT);
  const t0 = performance.now(), from = next.volume, pfrom = prev ? prev.volume : 0;
  fadeT = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / 800);
    next.volume = from + (VOL * VOLS.bgm - from) * k;
    if (prev) { prev.volume = pfrom * (1 - k); if (k >= 1) prev.pause(); }
    if (k >= 1) clearInterval(fadeT);
  }, 50);
  // 다른 곡은 멈춰 둔다
  for (const [k2, a] of Object.entries(players)) if (a !== next && a !== prev && !a.paused) a.pause();
}
// 레이드 · 대전 곡이 있으면 보스 웨이브에도 그 곡 그대로 (모드 곡이 우선)
const target = () => (modeKey && !bad[modeKey] && !(avail && !avail.has(TRACKS[modeKey])) ? modeKey : bossOn && !bad.boss ? 'boss' : want);
export function setChapter(ch) { want = TRACKS[ch] ? ch : 1; if (playing && !muted) switchTo(target()); }
// 레이드 · 1:1 대전: 전용 곡 (null 이면 챕터 곡으로)
export function setMode(m) { const k = m && TRACKS[m] ? m : null; if (modeKey === k) return; modeKey = k; if (playing && !muted) switchTo(target()); }
// 서버가 알려준 "있는 파일" 목록 (없는 곡은 요청 안 함)
export function setAvail(files) { avail = Array.isArray(files) ? new Set(files) : null; if (modeKey && playing && !muted && curKey !== target()) switchTo(target()); }
export function setBoss(on) { if (bossOn === !!on) return; bossOn = !!on; if (playing && !muted) switchTo(target()); }
export function playBgm() {
  playing = true;
  if (muted) return;
  if (curKey === target() && players[curKey] && !players[curKey].paused) return;
  switchTo(target());
}
// 배경음악이 실제로 나오고 있나 (자동 재생이 막히면 false)
export function bgmActive() { const a = curKey && players[curKey]; return !!(a && !a.paused && a.currentTime > 0); }
export function pauseBgm() { playing = false; clearInterval(fadeT); for (const a of Object.values(players)) a.pause(); curKey = null; for (const a of Object.values(players)) a.volume = 0; }

function ok(name, gap) {
  if (!ctx || muted) return false;
  const now = ctx.currentTime;
  const t = last.get(name) || 0;
  if (now - t < gap) return false;
  last.set(name, now);
  return true;
}

function tone(freq, dur, type = 'square', vol = 0.2, slide = 0, delay = 0) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.2, freq = 1200, q = 0.8, delay = 0, type = 'bandpass') {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + dur + 0.02);
}

// 영웅별 발사음 음색
const SHOT = {
  notice: () => { tone(520, 0.07, 'square', 0.05, 380); },
  warn: () => { tone(900, 0.05, 'triangle', 0.06, 700); },
  bullet: () => { tone(1300, 0.035, 'square', 0.03, 600); noise(0.03, 0.03, 3000); },
  flower: () => { tone(1500, 0.06, 'sine', 0.05, 1900); },
  bottle: () => { tone(300, 0.08, 'triangle', 0.07, 180); },
  wink: () => { tone(1200, 0.05, 'sine', 0.05, 1800); tone(1800, 0.06, 'sine', 0.04, 2400, 0.04); },
  cane: () => { noise(0.18, 0.08, 500, 1.5); tone(200, 0.12, 'sawtooth', 0.04, 120); },
};

export const sfx = {
  shot(proj) { if (SHOT[proj] && ok('s_' + proj, 0.07)) SHOT[proj](); },
  hit() { if (ok('hit', 0.035)) noise(0.05, 0.08, 1800, 1.2); },
  crit() { if (ok('crit', 0.08)) { noise(0.07, 0.14, 2600, 1); tone(1600, 0.06, 'square', 0.05, 900); } },
  kill() { if (ok('kill', 0.05)) { tone(420, 0.09, 'triangle', 0.1, 140); noise(0.08, 0.06, 700); } },
  gem() { if (ok('gem', 0.045)) tone(1700 + Math.random() * 400, 0.05, 'sine', 0.05, 2600); },
  coin() { if (ok('coin', 0.1)) { tone(1320, 0.06, 'square', 0.05); tone(1760, 0.1, 'square', 0.05, 0, 0.06); } },
  baseHit() { if (ok('base', 0.12)) { noise(0.12, 0.16, 300, 0.7, 0, 'lowpass'); tone(90, 0.12, 'sine', 0.14, 50); } },
  explode() { if (ok('boom', 0.06)) { noise(0.25, 0.2, 600, 0.6, 0, 'lowpass'); tone(160, 0.2, 'sawtooth', 0.06, 50); tone(2200, 0.06, 'triangle', 0.04, 3000); } },
  slam() { if (ok('slam', 0.3)) { noise(0.6, 0.45, 180, 0.5, 0, 'lowpass'); tone(60, 0.5, 'sine', 0.35, 30); } },
  charm() { if (ok('charm', 0.2)) { tone(880, 0.12, 'sine', 0.07, 1320); tone(1320, 0.18, 'sine', 0.06, 990, 0.1); } },
  kick() { if (ok('kick', 0.15)) { tone(700, 0.08, 'square', 0.07, 1400); } },
  steal() { if (ok('steal', 0.3)) { for (let i = 0; i < 4; i++) tone(1400 - i * 220, 0.07, 'square', 0.05, 0, i * 0.05); } },
  heal() { if (ok('heal', 0.4)) { tone(660, 0.15, 'sine', 0.06, 990); tone(990, 0.2, 'sine', 0.05, 1320, 0.08); } },
  levelUp() { if (ok('lv', 0.2)) [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'square', 0.07, 0, i * 0.07)); },
  card() { if (ok('card', 0.08)) { tone(740, 0.08, 'triangle', 0.08, 1100); noise(0.05, 0.05, 4000); } },
  pick() { if (ok('pick', 0.1)) [784, 988, 1318].forEach((f, i) => tone(f, 0.12, 'triangle', 0.09, 0, i * 0.05)); },
  wave() { if (ok('wave', 0.5)) { tone(392, 0.14, 'sawtooth', 0.06); tone(523, 0.22, 'sawtooth', 0.06, 0, 0.12); } },
  clear() { if (ok('clear', 0.5)) [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.08, 0, i * 0.09)); },
  boss() {
    if (!ok('boss', 1)) return;
    tone(110, 0.9, 'sawtooth', 0.12, 80);
    tone(165, 0.9, 'sawtooth', 0.08, 120, 0.05);
    noise(0.8, 0.12, 200, 0.5, 0, 'lowpass');
  },
  bossKill() { if (ok('bk', 1)) { noise(0.9, 0.35, 300, 0.4, 0, 'lowpass'); [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'square', 0.06, 0, 0.25 + i * 0.09)); } },
  rage() { if (ok('rage', 1)) { tone(220, 0.5, 'sawtooth', 0.12, 440); tone(233, 0.5, 'sawtooth', 0.1, 466); noise(0.4, 0.1, 900); } },
  ult() { if (ok('ult', 0.5)) { tone(300, 0.5, 'sawtooth', 0.12, 900); noise(0.7, 0.3, 400, 0.4, 0.1, 'lowpass'); tone(80, 0.6, 'sine', 0.3, 40, 0.1); } },
  win() { if (ok('win', 2)) [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.25, 'square', 0.07, 0, i * 0.12)); },
  lose() { if (ok('lose', 2)) [392, 370, 349, 262].forEach((f, i) => tone(f, 0.35, 'triangle', 0.09, 0, i * 0.22)); },
  tap() { if (ok('tap', 0.05)) tone(1000, 0.03, 'sine', 0.04, 1400); },
  thud() { if (ok('thud', 0.12)) { noise(0.16, 0.07, 160, 0.6, 0, 'lowpass'); tone(70, 0.14, 'sine', 0.05, 48); } }, // 윤정섭 발소리 (쿵 · 작게)
  // UI 소리: 확인(출격·구매) · 뒤로 · 탭 바꾸기 · 안 됨 · 보상 받기
  confirm() { if (ok('ui', 0.06)) { tone(660, 0.05, 'triangle', 0.06, 990); tone(990, 0.07, 'triangle', 0.05, 1320, 0.04); } },
  whoosh() { if (ok('whoosh', 0.2)) noise(0.18, 0.05, 1800, 0.8, 0, 'bandpass'); },
  whooshBack() { if (ok('whoosh', 0.2)) noise(0.14, 0.03, 900, 0.8, 0, 'bandpass'); },
  heartbeat() { if (ok('hb', 1)) [0, 0.28, 1.1, 1.38].forEach((d) => tone(60, 0.14, 'sine', 0.22, 40, d)); },
  rise() { if (ok('rise', 1)) { noise(1.2, 0.08, 800, 0.6); tone(220, 1.2, 'sawtooth', 0.05, 880); } },
  horn() { if (ok('horn', 1)) { tone(233, 0.55, 'sawtooth', 0.1, 220); tone(294, 0.55, 'sawtooth', 0.08, 277); tone(233, 0.4, 'sawtooth', 0.09, 220, 0.62); tone(294, 0.4, 'sawtooth', 0.07, 277, 0.62); } }, // 빠앙- 빵!
  back() { if (ok('ui', 0.06)) tone(700, 0.05, 'sine', 0.04, 420); },
  tabSw() { if (ok('ui', 0.06)) { tone(880, 0.025, 'square', 0.025); tone(1320, 0.03, 'sine', 0.03, 0, 0.02); } },
  deny() { if (ok('ui', 0.1)) { tone(220, 0.07, 'square', 0.05); tone(180, 0.08, 'square', 0.04, 0, 0.06); } },
  reward() { if (ok('ui', 0.1)) [1175, 1568, 2093].forEach((f, i) => tone(f, 0.07, 'square', 0.04, 0, i * 0.05)); },
  join() { if (ok('join', 0.3)) [659, 880, 1175].forEach((f, i) => tone(f, 0.14, 'sine', 0.08, 0, i * 0.06)); },
  // 멀티킬 스팅어: 단계가 오를수록 더 높고 길게 (펑 + 올라가는 음 + 반짝)
  multi(tier) {
    if (!ok('multi', 0.3)) return;
    const base = [660, 784, 880, 1046][tier] || 660;
    noise(0.12 + tier * 0.05, 0.12 + tier * 0.03, 900, 0.7, 0, 'lowpass');
    tone(110 + tier * 20, 0.18 + tier * 0.05, 'sine', 0.18, 50);
    const steps = 3 + tier;
    for (let i = 0; i < steps; i++) tone(base * Math.pow(1.122, i * 2), 0.09, 'square', 0.05, 0, 0.03 + i * 0.045);
    tone(base * 2, 0.25 + tier * 0.08, 'triangle', 0.05, base * 3, 0.05 + steps * 0.045);
  },
  // 떼거리 웨이브: 낮은 우르르
  rumble() { if (ok('rumble', 1)) { noise(1.1, 0.22, 220, 0.4, 0, 'lowpass'); tone(48, 1.0, 'sine', 0.28, 36); tone(62, 0.8, 'sawtooth', 0.04, 44, 0.1); } },
  // "와 떴다!" 등장 스팅어: 올라가는 휘릭 + 번쩍 + 팡파레 (LEGEND 는 더 길고 낮은 울림)
  reveal(kind) {
    if (!ok('reveal', 1)) return;
    const lg = kind === 'legend';
    tone(200, 0.6, 'sawtooth', 0.08, lg ? 1600 : 1200);
    noise(0.5, 0.12, 2400, 0.7);
    const notes = lg ? [523, 659, 784, 1046, 1318, 1568] : kind === 'hidden' ? [587, 740, 880, 1175, 1480] : [523, 659, 784, 1046];
    notes.forEach((f, i) => { tone(f, 0.28, 'square', 0.07, 0, 0.55 + i * 0.09); tone(f * 1.5, 0.22, 'triangle', 0.04, 0, 0.58 + i * 0.09); });
    if (lg) { tone(65, 1.4, 'sine', 0.3, 50, 0.5); noise(1.0, 0.18, 300, 0.5, 0.5, 'lowpass'); }
  },
};
