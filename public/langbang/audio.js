// 랑방 대전 — Web Audio 합성 효과음 + 배경음악
// 첫 터치 때 AudioContext 를 연다(모바일 자동재생 정책). 음소거는 localStorage 에 기억.

const LS_KEY = 'langbang:mute';
let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem(LS_KEY) === '1'; } catch { /* 저장소 막힘 */ }
const last = new Map(); // 효과음별 마지막 재생 시각 (너무 잦은 재생 방지)
let bgm = null;
let bgmOk = true;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
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
  if (master) master.gain.value = muted ? 0 : 0.55;
  if (bgm) { if (muted) bgm.pause(); else playBgm(); }
}

// 배경음악: 파일이 없으면 조용히 포기
export function playBgm() {
  if (muted || !bgmOk) return;
  if (!bgm) {
    bgm = new Audio('/sounds/bgm_langbang.mp3');
    bgm.loop = true;
    bgm.volume = 0.4;
    bgm.addEventListener('error', () => { bgmOk = false; });
  }
  const p = bgm.play();
  if (p && p.catch) p.catch(() => {});
}
export function pauseBgm() { if (bgm) bgm.pause(); }

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
  join() { if (ok('join', 0.3)) [659, 880, 1175].forEach((f, i) => tone(f, 0.14, 'sine', 0.08, 0, i * 0.06)); },
};
