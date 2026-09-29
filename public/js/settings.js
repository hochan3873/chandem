// 사이트 공용 설정 (이 기기에만 저장). 다른 게임(랑방 대전 등)도 window.gwSettings 로 읽을 수 있다.
//   gwSettings.get('vibrate')  → true/false
//   gwSettings.vibrate(60)     → 진동 설정이 켜져 있을 때만 진동
//   gwSettings.reduceMotion()  → 화면 흔들림 줄이기
//   gwSettings.sound()         → { muted, volume, music, musicVolume, voice } (소리 설정은 sound.js 와 같은 저장값)
//   gwSettings.onChange(fn)    → 바뀔 때마다 fn(all)
const KEY = 'gw:settings';
const SOUND_KEY = 'chandem:sound';
const DEFAULTS = { vibrate: true, popups: true, reduceMotion: false };

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
let cur = load();
const listeners = new Set();

function apply() {
  document.documentElement.classList.toggle('gw-reduce-motion', !!cur.reduceMotion);
}
export function all() { return { ...cur }; }
export function get(k) { return cur[k]; }
export function set(k, v) {
  if (!(k in DEFAULTS)) return;
  cur[k] = !!v;
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch {}
  apply();
  for (const fn of listeners) { try { fn(all()); } catch {} }
}
export function vibrate(pattern) {
  if (!cur.vibrate || !navigator.vibrate) return false;
  try { return navigator.vibrate(pattern); } catch { return false; }
}
export const reduceMotion = () => !!cur.reduceMotion;

window.gwSettings = {
  get, set, all, vibrate, reduceMotion,
  sound() { try { return JSON.parse(localStorage.getItem(SOUND_KEY) || '{}'); } catch { return {}; } },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
// 다른 탭에서 바꿔도 맞춘다
window.addEventListener('storage', (e) => { if (e.key === KEY) { cur = load(); apply(); } });
apply();
