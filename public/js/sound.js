// 효과음·음성: 첫 터치 이후에만 재생. 파일이 없으면 Web Audio로 직접 합성한 소리를 쓴다.
const KEY = 'chandem:sound';
let ctx = null;
let master = null;
let unlocked = false;
const buffers = {};
let manifest = null;

const prefs = (() => {
  const base = { muted: false, volume: 0.7, voice: true, music: true, musicVolume: 0.35, friendLoud: false };
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
// 친구들과 하는 방(사람 2명 이상): 음성(콜!·다이!)과 배경음악은 기본으로 끈다. 카드·칩·노크 같은 효과음은 그대로
let quiet = false;
export function setQuietRoom(on) { on = !!on; if (on === quiet) return; quiet = on; applyMusic(); }
export function setFriendLoud(on) { prefs.friendLoud = !!on; save(); applyMusic(); }
export const isQuietRoom = () => quiet;
const hush = () => quiet && !prefs.friendLoud;
const voiceOK = () => prefs.voice && !hush();

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
  const want = prefs.music && !prefs.muted && !document.hidden && prefs.musicVolume > 0 && !hush();
  if (!want) for (const a of fading) { a.pause(); fading.delete(a); }
  if (!bgm) {
    if (!want) return;
    // 목록(manifest)을 아직 못 받았으면 이름 규칙(곡이름.mp3)으로 바로 시작
    const file = manifest ? (manifest[track] || manifest.bgm) : track + '.mp3';
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
  if (master) master.gain.value = prefs.muted ? 0 : prefs.volume * 2.2;
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

// 휴대폰 브라우저는 '손가락을 뗄 때(touchend/click)'만 소리 재생을 허락한다 (touchstart·pointerdown 은 안 됨).
// 그래서 한 번 풀었어도, 소리가 아직 막혀 있으면(suspended · 음악 멈춤) 다음 터치 때 다시 시도한다.
export function unlock() {
  if (unlocked) {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (!bgm || bgm.paused) applyMusic();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  // 폰 스피커에서도 또렷하게: 전체를 키우고 리미터로 찢어지지 않게
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.12;
  master.connect(comp).connect(ctx.destination);
  unlocked = true;
  // 소리가 실제로 풀리면 이 탭에 기억 (사이트 안에서 페이지를 옮겨도 다시 '터치해서 시작'을 안 띄우려고)
  const noteOK = () => { if (ctx.state === 'running') { try { sessionStorage.setItem('gw:audioOK', '1'); } catch {} window.dispatchEvent(new Event('gw:audio')); } };
  ctx.onstatechange = noteOK;
  setTimeout(noteOK, 0);
  applyVolume(); // 목록을 받기 전이라도 지금(터치 안에서) 배경음악 재생을 시작한다
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  loadManifest().then(() => {
    for (const n of Object.keys(manifest)) if (!n.startsWith('bgm')) loadBuffer(n);
    applyMusic();
  });
}

/** 터치 없이 조용히 소리 풀기 시도 (같은 사이트에서 이미 터치한 탭이면 브라우저가 허락하기도 함) → 풀렸으면 true */
export async function tryResume(ms = 350) {
  unlock();
  if (!ctx) return false;
  if (ctx.state !== 'running') { try { await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, ms))]); } catch {} }
  await new Promise((r) => setTimeout(r, 150)); // 배경음악 play() 결과를 잠깐 기다림
  return !isLocked();
}
/** 아직 소리가 막혀 있나 (오디오가 멈춰 있거나, 음악을 켜 뒀는데 재생이 거절됨) */
export function isLocked() {
  if (!ctx || ctx.state !== 'running') return true;
  const wantMusic = prefs.music && !prefs.muted && prefs.musicVolume > 0 && !document.hidden && !hush();
  return wantMusic && (!bgm || bgm.paused);
}
/** 소리를 아예 꺼 둔 사람인가 (그러면 '소리 켜기' 안내가 필요 없음) */
export const soundOff = () => prefs.muted && !prefs.music;

['pointerdown', 'touchstart', 'pointerup', 'touchend', 'click', 'keydown'].forEach((ev) => {
  window.addEventListener(ev, unlock, { once: false, passive: true, capture: true });
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

// 음높이가 뚝 떨어지는 짧은 타격음 (폰 스피커에서도 잘 들리는 300~1200Hz 대역)
function drop(f0, f1, dur, gain, at = 0, type = 'sine') {
  const o = ctx.createOscillator(); const g = ctx.createGain(); const t = ctx.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.003); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.03);
}
// 점토 칩 하나가 '딱' 부딪히는 소리
function clack(at = 0, g = 1) {
  const f = 2600 + Math.random() * 1600;
  tone(f, 0.035, { type: 'triangle', gain: 0.22 * g, at });
  tone(f * 1.48, 0.025, { type: 'sine', gain: 0.1 * g, at: at + 0.004 });
  setTimeout(() => noise(0.025, { freq: 5200, q: 2.5, gain: 0.28 * g }), at * 1000);
}

const SYNTH = {
  // 카드 한 장이 펠트 위로 '착' 미끄러지는 소리
  deal: () => {
    noise(0.07, { freq: 2800 + Math.random() * 900, q: 0.8, gain: 0.55, attack: 0.006 });
    setTimeout(() => noise(0.05, { freq: 1300, q: 1.2, gain: 0.32 }), 45);
  },
  // 바닥 카드 뒤집기 (플랍·턴·리버): '착 착 착'
  flip: () => { for (let i = 0; i < 3; i++) setTimeout(() => { noise(0.06, { freq: 3000 + Math.random() * 900, q: 0.9, gain: 0.5, attack: 0.004 }); drop(900, 500, 0.05, 0.18); }, i * 130); },
  // 턴·리버: 번 카드를 빼고 한 장을 '착'
  flip1: () => { noise(0.05, { freq: 2000, q: 0.8, gain: 0.25 }); setTimeout(() => { noise(0.07, { freq: 3100, q: 0.9, gain: 0.55, attack: 0.004 }); drop(900, 480, 0.06, 0.2); }, 180); },
  // 딜러 버튼이 다음 자리로 미끄러짐
  button: () => { noise(0.12, { freq: 1800, q: 0.8, gain: 0.18, attack: 0.03 }); drop(700, 420, 0.05, 0.25, 0.12); },
  chip: () => { clack(0); clack(0.04, 0.7); },
  // 베팅·콜: 칩 몇 개를 툭툭 내려놓는 소리
  chips: () => { const n = 4 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) clack(i * (0.03 + Math.random() * 0.025), 0.8 + Math.random() * 0.3); },
  // 팟을 가져올 때: 칩 더미가 와르르 모이는 소리 (조용한 방에서도 남김)
  collect: () => { for (let i = 0; i < 14; i++) clack(i * 0.035 + Math.random() * 0.02, 0.55 + Math.random() * 0.4); noise(0.35, { freq: 2200, q: 0.6, gain: 0.12, attack: 0.05 }); },
  check: () => SYNTH.knock(),
  // 폴드: 카드 두 장을 던지면 '툭, 툭' 하고 펠트에 떨어진다
  fold: () => {
    noise(0.09, { freq: 2400, q: 0.7, gain: 0.32, attack: 0.02 }); // 휙
    setTimeout(() => { drop(520, 220, 0.07, 0.55); noise(0.05, { freq: 950, q: 1.3, gain: 0.55 }); }, 110); // 툭
    setTimeout(() => { drop(470, 210, 0.06, 0.4); noise(0.04, { freq: 900, q: 1.3, gain: 0.4 }); }, 210); // 툭
  },
  // 홀덤 올인: 칩 더미를 앞으로 '스윽' 밀고 내려놓는 소리 (외침·요란함 없이)
  allinPush: () => {
    noise(0.22, { freq: 2000, q: 0.7, gain: 0.22, attack: 0.05 });
    for (let i = 0; i < 6; i++) clack(0.16 + i * 0.03, 0.7);
  },
  // 홀덤 올인 승부 시작: 낮고 조용한 심장 박동 두 번 (북 연타 대신)
  allinTension: () => { tone(55, 0.16, { type: 'sine', gain: 0.35 }); tone(50, 0.2, { type: 'sine', gain: 0.25, at: 0.18 }); },
  // 채팅 알림: 맑은 '띠링' (메신저 느낌, 짧고 작게)
  msg: () => { tone(1568, 0.12, { type: 'sine', gain: 0.13 }); tone(2093, 0.22, { type: 'sine', gain: 0.11, at: 0.09 }); },
  // 체크: 주먹으로 테이블을 '탁탁' (나무 두 번 · 폰 스피커에서 잘 들리는 대역)
  knock: () => {
    const hit = (at, g) => { drop(780, 330, 0.07, 0.6 * g, at); drop(1500, 900, 0.03, 0.25 * g, at, 'triangle'); setTimeout(() => noise(0.035, { freq: 1700, q: 1.6, gain: 0.6 * g, attack: 0.002 }), at * 1000); };
    hit(0, 1); hit(0.14, 0.85);
  },
  // 자리에 앉기 · 일어나기
  sit: () => { drop(600, 300, 0.08, 0.3); clack(0.06, 0.5); },
  // 셔플: 카드 리플 (짧은 딸깍이 빠르게)
  shuffle: () => {
    for (let i = 0; i < 22; i++) setTimeout(() => noise(0.03, { freq: 2800 + Math.random() * 2200, q: 1.1, gain: 0.25 + Math.random() * 0.1 }), i * 22 + Math.random() * 8);
    setTimeout(() => noise(0.12, { freq: 1800, q: 0.6, gain: 0.4, attack: 0.01 }), 520);
  },
  // 감정 표현: 짧은 '띵'
  ding: () => { tone(1320, 0.18, { type: 'sine', gain: 0.16 }); tone(1760, 0.3, { type: 'sine', gain: 0.12, at: 0.08 }); },
  hmm: () => { tone(220, 0.25, { type: 'triangle', gain: 0.14 }); tone(196, 0.3, { type: 'triangle', gain: 0.12, at: 0.22 }); },
  gulp: () => { const o = ctx.createOscillator(); const g = ctx.createGain(); const t = ctx.currentTime; o.frequency.setValueAtTime(500, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.18); g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22); o.connect(g).connect(master); o.start(t); o.stop(t + 0.25); },
  allin: () => { for (let i = 0; i < 10; i++) tone(1800 + Math.random() * 1600, 0.06, { type: 'triangle', gain: 0.12, at: i * 0.03 }); tone(110, 0.5, { type: 'sawtooth', gain: 0.08 }); },
  turn: () => { tone(880, 0.18, { gain: 0.18 }); tone(1320, 0.25, { gain: 0.14, at: 0.1 }); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { type: 'triangle', gain: 0.16, at: i * 0.09 })); },
  lose: () => { tone(330, 0.2, { gain: 0.1 }); tone(262, 0.3, { gain: 0.1, at: 0.15 }); },
  tick: () => tone(1500, 0.04, { type: 'square', gain: 0.1 }),
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
  tap: () => { tone(1250, 0.035, { type: 'triangle', gain: 0.1 }); tone(1850, 0.03, { type: 'sine', gain: 0.05, at: 0.012 }); },
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
let koVoice = null;
function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices() || [];
    koVoice = vs.find((v) => /^ko/i.test(v.lang) && /Yuna|유나|Google|Heami|SunHi/i.test(v.name)) || vs.find((v) => /^ko/i.test(v.lang)) || null;
  } catch {}
}
if (window.speechSynthesis) { pickVoice(); try { speechSynthesis.addEventListener('voiceschanged', pickVoice); } catch {} }
function speak(text, rate = 1.05) {
  try {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR'; u.rate = rate; u.volume = Math.min(1, prefs.volume + 0.2);
    if (koVoice) u.voice = koVoice;
    speechSynthesis.speak(u);
  } catch {}
}

// ── 섯다 외치기 ("삥!" "따당!" …): /sounds/seotda_<말>.mp3 가 있으면 그 파일, 없으면 기기 음성 ──
const fileKnown = {};
async function hasFile(name) {
  if (fileKnown[name] !== undefined) return fileKnown[name];
  if (manifest && manifest[name]) return (fileKnown[name] = true);
  try { const r = await fetch('/sounds/' + name + '.mp3', { method: 'HEAD' }); fileKnown[name] = r.ok; } catch { fileKnown[name] = false; }
  return fileKnown[name];
}
let calloutChain = Promise.resolve();
export function callout(name, text) {
  if (!unlocked || prefs.muted || !voiceOK()) return;
  // 여러 사람이 연달아 해도 겹치지 않게 줄 세운다 (한 마디 + 잠깐 쉼)
  calloutChain = calloutChain.then(async () => {
    if (await hasFile(name)) {
      if (manifest && !manifest[name]) manifest[name] = name + '.mp3';
      await play(name, 1.1);
      await new Promise((r) => setTimeout(r, 650));
    } else {
      speak(text, 1.1);
      await new Promise((r) => setTimeout(r, 520));
    }
  }).catch(() => {});
}

/** 짧은 말을 기기 음성으로 (섯다 족보 등 파일이 없는 말) */
export function say(text) {
  if (!unlocked || prefs.muted || !voiceOK()) return;
  speak(text);
}

/** name: 효과음 이름 (deal, chip, check …) 또는 음성 이름 (v_call …, e_angry …) */
// 친구 방(조용한 방)에서는 연출용 큰 소리를 내지 않는다: 홀덤에만 집중 (카드·칩·노크·차례·채팅 알림만)
const DRAMA = new Set(['heartbeat', 'impact', 'drumroll', 'allinTension', 'boom', 'fanfare', 'coins', 'stamp', 'lose']); // 'collect'(팟 가져오기)는 남김
export async function play(name, gain = 1) {
  if (!unlocked || prefs.muted || !ctx) return;
  if (hush() && DRAMA.has(name)) return;
  if ((name.startsWith('v_') || name.startsWith('e_')) && !voiceOK()) return;
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
    case 'check': play('knock'); play('v_check'); break;
    case 'call': play('chips'); play('v_call'); break;
    case 'bet': play('chips'); play('v_bet'); break;
    case 'raise': play('chips'); play('v_raise'); break;
    case 'allin': play('allinPush'); break; // 홀덤: 외치는 음성·요란한 소리 없이
    case 'street': play(e.board && e.board.length > 3 ? 'flip1' : 'flip'); break; // 플랍은 착착착, 턴·리버는 한 장
    case 'end': if (iWon) play('v_win'); break; // 칩·팡파르는 승리 연출(celebrate)에서
    default: break;
  }
  return isMe;
}
