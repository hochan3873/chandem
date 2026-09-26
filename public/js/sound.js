// 효과음·음성: 첫 터치 이후에만 재생. 파일이 없으면 Web Audio로 직접 합성한 소리를 쓴다.
const KEY = 'chandem:sound';
let ctx = null;
let master = null;
let unlocked = false;
const buffers = {};
let manifest = null;

const prefs = (() => {
  try { return { muted: false, volume: 0.7, voice: true, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { muted: false, volume: 0.7, voice: true }; }
})();

function save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} }

export function getPrefs() { return { ...prefs }; }
export function setMuted(m) { prefs.muted = !!m; save(); applyVolume(); }
export function setVolume(v) { prefs.volume = Math.max(0, Math.min(1, Number(v))); save(); applyVolume(); }
export function setVoice(v) { prefs.voice = !!v; save(); }
export function isUnlocked() { return unlocked; }

function applyVolume() {
  if (master) master.gain.value = prefs.muted ? 0 : prefs.volume;
}

async function loadManifest() {
  try {
    const r = await fetch('/sounds/manifest.json', { cache: 'no-cache' });
    if (r.ok) manifest = await r.json();
  } catch { manifest = {}; }
  if (!manifest) manifest = {};
}

async function loadBuffer(name) {
  if (buffers[name] !== undefined) return buffers[name];
  buffers[name] = null;
  const file = manifest && manifest[name];
  if (!file) return null;
  try {
    const r = await fetch('/sounds/' + file);
    const arr = await r.arrayBuffer();
    buffers[name] = await ctx.decodeAudioData(arr);
  } catch { buffers[name] = null; }
  return buffers[name];
}

export function unlock() {
  if (unlocked) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  applyVolume();
  if (ctx.state === 'suspended') ctx.resume();
  unlocked = true;
  loadManifest().then(() => {
    for (const n of Object.keys(manifest)) loadBuffer(n);
  });
}

['pointerdown', 'touchstart', 'keydown'].forEach((ev) => {
  window.addEventListener(ev, unlock, { once: false, passive: true });
});

function playBuffer(buf, gain = 1) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.start();
}

// ── 합성 효과음 (파일이 없을 때) ─────────────────────
function noise(dur, { freq = 2000, q = 1, gain = 0.4, type = 'bandpass', attack = 0.003 } = {}) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start();
}

function tone(freq, dur, { type = 'sine', gain = 0.25, at = 0 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const t = ctx.currentTime + at;
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

const SYNTH = {
  deal: () => noise(0.12, { freq: 3500, q: 0.8, gain: 0.35 }),
  flip: () => { noise(0.08, { freq: 2500, gain: 0.3 }); setTimeout(() => noise(0.06, { freq: 4000, gain: 0.2 }), 40); },
  chip: () => { tone(2400, 0.05, { type: 'triangle', gain: 0.18 }); tone(3100, 0.06, { type: 'triangle', gain: 0.12, at: 0.035 }); },
  chips: () => { for (let i = 0; i < 5; i++) tone(2200 + Math.random() * 1400, 0.05, { type: 'triangle', gain: 0.12, at: i * 0.035 }); },
  check: () => { tone(180, 0.09, { type: 'sine', gain: 0.5 }); tone(170, 0.08, { type: 'sine', gain: 0.4, at: 0.12 }); },
  fold: () => noise(0.25, { freq: 900, q: 0.5, gain: 0.25, type: 'lowpass', attack: 0.04 }),
  allin: () => { for (let i = 0; i < 10; i++) tone(1800 + Math.random() * 1600, 0.06, { type: 'triangle', gain: 0.12, at: i * 0.03 }); tone(110, 0.5, { type: 'sawtooth', gain: 0.08 }); },
  turn: () => { tone(880, 0.18, { gain: 0.18 }); tone(1320, 0.25, { gain: 0.14, at: 0.1 }); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { type: 'triangle', gain: 0.16, at: i * 0.09 })); },
  lose: () => { tone(330, 0.2, { gain: 0.1 }); tone(262, 0.3, { gain: 0.1, at: 0.15 }); },
  tick: () => tone(1500, 0.03, { type: 'square', gain: 0.05 }),
};

/** name: 효과음 이름 (deal, chip, check …) 또는 음성 이름 (v_call …) */
export async function play(name) {
  if (!unlocked || prefs.muted || !ctx) return;
  if (name.startsWith('v_') && !prefs.voice) return;
  if (!manifest) await loadManifest();
  const buf = await loadBuffer(name);
  if (buf) { playBuffer(buf); return; }
  if (SYNTH[name]) SYNTH[name]();
}

/** 게임 기록 한 줄 → 소리 */
export function playForEvent(e, { isMe = false, iWon = false } = {}) {
  switch (e.type) {
    case 'blind': play('chip'); break;
    case 'fold': play('fold'); play('v_fold'); break;
    case 'check': play('check'); play('v_check'); break;
    case 'call': play('chips'); play('v_call'); break;
    case 'bet': play('chips'); play('v_bet'); break;
    case 'raise': play('chips'); play('v_raise'); break;
    case 'allin': play('allin'); play('v_allin'); break;
    case 'street': play('flip'); break;
    case 'end': play(iWon ? 'win' : 'chips'); if (iWon) play('v_win'); break;
    default: break;
  }
  return isMe;
}
