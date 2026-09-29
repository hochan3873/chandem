// 효과음·음성: 첫 터치 이후에만 재생. 파일이 없으면 Web Audio로 직접 합성한 소리를 쓴다.
const KEY = 'chandem:sound';
let ctx = null;
let master = null;
let unlocked = false;
const buffers = {};
let manifest = null;

const prefs = (() => {
  const base = { muted: false, volume: 0.7, voice: true, music: true, musicVolume: 0.35 };
  try { return { ...base, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return base; }
})();

function save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} }

export function getPrefs() { return { ...prefs }; }
export function setMuted(m) { prefs.muted = !!m; save(); applyVolume(); }
export function setVolume(v) { prefs.volume = Math.max(0, Math.min(1, Number(v))); save(); applyVolume(); }
export function setVoice(v) { prefs.voice = !!v; save(); }
export function setMusic(on) { prefs.music = !!on; save(); applyMusic(); }
export function setMusicVolume(v) { prefs.musicVolume = Math.max(0, Math.min(1, Number(v))); save(); applyMusic(); }

// ── 배경음악: <audio> 로 스트리밍 + 반복 재생 ───────────────
let bgm = null;
let track = 'bgm';           // 화면마다 다른 곡: bgm_hub(메인) · bgm(홀덤) · bgm_seotda · bgm_omok
let bgmTrack = null;
/** 곡 바꾸기: 이전 곡은 천천히 줄이고 새 곡으로 */
export function setTrack(name) {
  if (name === track) return;
  track = name;
  if (bgm && bgmTrack !== name) {
    // 이전 곡: 볼륨을 줄이다가 '정해진 횟수 뒤에는 무조건' 멈춘다.
    // (아이폰은 웹에서 볼륨을 못 바꿔서, 볼륨이 0 이 되기를 기다리면 영원히 안 멈춘다)
    const old = bgm; bgm = null;
    fading.add(old);
    let n = 0;
    const step = () => {
      try { old.volume = Math.max(0, old.volume - 0.06); } catch {}
      if (++n < 16 && old.volume > 0.01) setTimeout(step, 40);
      else { old.pause(); fading.delete(old); }
    };
    step();
  }
  applyMusic();
}
const fading = new Set(); // 바뀌는 중인 이전 곡들 (음악을 끄면 이것도 함께 멈춤)
function applyMusic() {
  if (!unlocked) return;
  const want = prefs.music && !prefs.muted && !document.hidden && prefs.musicVolume > 0;
  if (!want) for (const a of fading) { a.pause(); fading.delete(a); }
  if (!bgm) {
    if (!want) return;
    const file = manifest && (manifest[track] || manifest.bgm);
    if (!file) return;
    bgm = new Audio('/sounds/' + file);
    bgm.loop = true;
    bgm.preload = 'auto';
    bgmTrack = track;
  }
  try { bgm.volume = prefs.musicVolume; } catch {}
  if (want) {
    if (bgm.paused) {
      const a = bgm;
      // 재생 요청이 늦게 끝나는 사이에 음악을 껐다면 곧바로 다시 멈춘다
      a.play().then(() => { if (a !== bgm || !(prefs.music && !prefs.muted && !document.hidden)) a.pause(); }).catch(() => {});
    }
  } else if (!bgm.paused) bgm.pause();
}
/** 지금 재생 중인 배경음악 개수 (검증용) */
export function playingCount() { return [bgm, ...fading].filter((a) => a && !a.paused).length; }
document.addEventListener('visibilitychange', applyMusic);
export function musicState() { return bgm ? { playing: !bgm.paused, src: bgm.src, volume: bgm.volume } : null; }
export function isUnlocked() { return unlocked; }

function applyVolume() {
  if (master) master.gain.value = prefs.muted ? 0 : prefs.volume;
  applyMusic();
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
    for (const n of Object.keys(manifest)) if (!n.startsWith('bgm')) loadBuffer(n);
    applyMusic();
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
  // 카드 한 장이 테이블 위로 휙 미끄러지는 소리
  deal: () => {
    noise(0.09, { freq: 2600 + Math.random() * 1400, q: 0.9, gain: 0.32, attack: 0.012 });
    setTimeout(() => noise(0.03, { freq: 1200, q: 1.5, gain: 0.18 }), 70);
  },
  flip: () => { for (let i = 0; i < 3; i++) setTimeout(() => { noise(0.08, { freq: 2600 + Math.random() * 1200, gain: 0.3, attack: 0.01 }); setTimeout(() => noise(0.04, { freq: 4200, gain: 0.18 }), 40); }, i * 120); },
  chip: () => { tone(2400, 0.05, { type: 'triangle', gain: 0.18 }); tone(3100, 0.06, { type: 'triangle', gain: 0.12, at: 0.035 }); },
  chips: () => { for (let i = 0; i < 5; i++) tone(2200 + Math.random() * 1400, 0.05, { type: 'triangle', gain: 0.12, at: i * 0.035 }); },
  check: () => { tone(180, 0.09, { type: 'sine', gain: 0.5 }); tone(170, 0.08, { type: 'sine', gain: 0.4, at: 0.12 }); },
  fold: () => noise(0.25, { freq: 900, q: 0.5, gain: 0.25, type: 'lowpass', attack: 0.04 }),
  allin: () => { for (let i = 0; i < 10; i++) tone(1800 + Math.random() * 1600, 0.06, { type: 'triangle', gain: 0.12, at: i * 0.03 }); tone(110, 0.5, { type: 'sawtooth', gain: 0.08 }); },
  turn: () => { tone(880, 0.18, { gain: 0.18 }); tone(1320, 0.25, { gain: 0.14, at: 0.1 }); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { type: 'triangle', gain: 0.16, at: i * 0.09 })); },
  lose: () => { tone(330, 0.2, { gain: 0.1 }); tone(262, 0.3, { gain: 0.1, at: 0.15 }); },
  tick: () => tone(1500, 0.03, { type: 'square', gain: 0.05 }),
  // 올인 도장: 쿵 + 금속성 충격
  stamp: () => {
    tone(55, 0.6, { type: 'sine', gain: 0.9 });
    tone(110, 0.25, { type: 'square', gain: 0.12 });
    noise(0.35, { freq: 1200, q: 0.5, gain: 0.45, type: 'lowpass' });
    noise(0.5, { freq: 6000, q: 2, gain: 0.08, attack: 0.02 });
  },
  // 플러시 이상: 올라가는 휘파람 + 폭발 + 반짝임
  boom: () => {
    const o = ctx.createOscillator(); const g = ctx.createGain(); const t = ctx.currentTime;
    o.type = 'sawtooth'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(1600, t + 0.45);
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.4); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.55);
    setTimeout(() => {
      tone(45, 0.9, { type: 'sine', gain: 1 });
      tone(90, 0.5, { type: 'triangle', gain: 0.3 });
      noise(0.8, { freq: 800, q: 0.3, gain: 0.5, type: 'lowpass' });
      for (let i = 0; i < 16; i++) tone(2500 + Math.random() * 3000, 0.12, { type: 'sine', gain: 0.06, at: 0.1 + i * 0.05 });
    }, 450);
  },
  // 박수 (짧은 잡음 여러 번)
  clap: () => { for (let i = 0; i < 9; i++) setTimeout(() => noise(0.07, { freq: 1500 + Math.random() * 800, q: 1.2, gain: 0.35 }), i * 90 + Math.random() * 40); },
  // 바둑돌 놓는 소리 (나무판에 딱)
  stone: () => { tone(1100, 0.05, { type: 'triangle', gain: 0.35 }); noise(0.06, { freq: 3200, q: 2, gain: 0.3 }); tone(320, 0.08, { type: 'sine', gain: 0.25 }); },
  pop: () => { tone(900, 0.08, { type: 'sine', gain: 0.2 }); tone(1400, 0.1, { type: 'sine', gain: 0.15, at: 0.05 }); },
  // 올인 승부 시작: 점점 커지는 스네어 롤 + 마지막 한 방
  drumroll: () => {
    for (let i = 0; i < 26; i++) setTimeout(() => noise(0.05, { freq: 2600, q: 0.7, gain: 0.05 + i * 0.012 }), i * 45);
    setTimeout(() => { tone(70, 0.5, { type: 'sine', gain: 0.6 }); noise(0.4, { freq: 1500, q: 0.4, gain: 0.35 }); }, 26 * 45);
  },
  // 리버를 쪼는 동안 심장 박동
  heartbeat: () => {
    for (let b = 0; b < 3; b++) {
      setTimeout(() => { tone(58, 0.16, { type: 'sine', gain: 0.8 }); tone(52, 0.2, { type: 'sine', gain: 0.6, at: 0.17 }); }, b * 620);
    }
  },
  // 카드가 확 뒤집힐 때 한 방
  impact: () => { tone(90, 0.45, { type: 'sine', gain: 0.55 }); noise(0.3, { freq: 900, q: 0.4, gain: 0.3, type: 'lowpass' }); },
  // 칩이 와르르 쏟아지는 소리
  coins: () => {
    for (let i = 0; i < 34; i++) {
      const t = i * (40 + Math.random() * 30);
      setTimeout(() => { tone(2000 + Math.random() * 2400, 0.07, { type: 'triangle', gain: 0.1 }); if (i % 3 === 0) noise(0.04, { freq: 5000, gain: 0.06 }); }, t);
    }
  },
  // 승리 팡파르 (브라스 느낌: 톱니파 + 저역 통과)
  fanfare: () => {
    const notes = [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.38], [784, 0.62], [1047, 0.74]];
    for (const [f, at] of notes) {
      const o = ctx.createOscillator(); const g = ctx.createGain(); const lp = ctx.createBiquadFilter();
      const t = ctx.currentTime + at; const d = at >= 0.74 ? 0.9 : 0.22;
      o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 2400;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(lp).connect(g).connect(master); o.start(t); o.stop(t + d + 0.05);
    }
    tone(262, 1.4, { type: 'triangle', gain: 0.12, at: 0.74 });
  },
};

// 음성 파일이 없을 때 쓰는 기기 음성(TTS) 문구
const TTS = {
  v_h0: '하이카드', v_h1: '원페어', v_h2: '투페어', v_h3: '트리플', v_h4: '스트레이트',
  v_h5: '플러시!', v_h6: '풀하우스!', v_h7: '포카드!', v_h8: '스트레이트 플러시!', v_h9: '로열 스트레이트 플러시!',
  e_angry: '아 진짜 열받네!', e_happy: '나이스!', e_mock: '쫄리냐?', e_laugh: '크하하하!', e_cry: '아이고 내 칩',
};
function speak(text) {
  try {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR'; u.rate = 1.05; u.volume = Math.min(1, prefs.volume + 0.2);
    speechSynthesis.speak(u);
  } catch {}
}

/** 짧은 말을 기기 음성으로 (섯다 족보 등 파일이 없는 말) */
export function say(text) {
  if (!unlocked || prefs.muted || !prefs.voice) return;
  speak(text);
}

/** name: 효과음 이름 (deal, chip, check …) 또는 음성 이름 (v_call …, e_angry …) */
export async function play(name, gain = 1) {
  if (!unlocked || prefs.muted || !ctx) return;
  if ((name.startsWith('v_') || name.startsWith('e_')) && !prefs.voice) return;
  if (!manifest) await loadManifest();
  const buf = await loadBuffer(name);
  if (buf) { playBuffer(buf, gain); return; }
  if (SYNTH[name]) SYNTH[name]();
  else if (TTS[name]) speak(TTS[name]);
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
    case 'end': if (iWon) play('v_win'); break; // 칩·팡파르는 승리 연출(celebrate)에서
    default: break;
  }
  return isMe;
}
