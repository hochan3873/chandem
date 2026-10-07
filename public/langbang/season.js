// 랑방 대전 — 시즌 테마 (할로윈 · 나중에 크리스마스 등): 기간(한국 시간) 안이면 로비 그림 · 장식 · 로비 음악이 바뀐다
// 설정의 "○○ 테마" 스위치로 끌 수 있다 (기간 안에서는 기본 켜짐). 새 시즌은 SEASONS 에 한 줄 추가.
//   from / to: [월, 일] (양 끝 포함, 한국 시간) — to 가 from 보다 앞이면 해를 넘기는 기간 (예: 12/20 ~ 1/2)
//   keyart: 로비 위쪽 키 아트 (게임월드 허브 카드에도) · bgm: audio.js TRACKS 키 (곡이 없으면 챕터 곡 그대로)
//   fx: 로비 장식 종류 (style.css .ssn-<fx>)
export const SEASONS = [
  { id: 'halloween', name: '할로윈', from: [10, 7], to: [11, 2], keyart: '/img/lb/season/halloween_key.webp', bgm: 'halloween', fx: 'halloween' },
];

const KST = 9 * 3600e3;
const md = (m, d) => m * 100 + d;
// 지금(한국 시간) 기간 안인 시즌 (없으면 null)
export function seasonAt(now = Date.now(), list = SEASONS) {
  const t = new Date(now + KST), v = md(t.getUTCMonth() + 1, t.getUTCDate());
  for (const s of list) {
    const a = md(s.from[0], s.from[1]), b = md(s.to[0], s.to[1]);
    if (a <= b ? v >= a && v <= b : v >= a || v <= b) return s;
  }
  return null;
}
// 시즌 끝나는 순간 (한국 시간 to 날 24:00) — 허브 카드 그림이 지나서도 남지 않게
export function seasonEnd(s, now = Date.now()) {
  const t = new Date(now + KST);
  let y = t.getUTCFullYear();
  if (md(s.to[0], s.to[1]) < md(s.from[0], s.from[1]) && md(t.getUTCMonth() + 1, t.getUTCDate()) >= md(s.from[0], s.from[1])) y++;
  return Date.UTC(y, s.to[0] - 1, s.to[1] + 1) - KST;
}
const key = (s) => 'langbang:season:' + s.id;
export function seasonPref(s) { try { return localStorage.getItem(key(s)) !== '0'; } catch { return true; } }
export function setSeasonPref(s, on) { try { localStorage.setItem(key(s), on ? '1' : '0'); } catch { /* 무시 */ } syncHub(); }
// 지금 켜져 있는 시즌 (기간 안 + 스위치 켬)
export function activeSeason(now = Date.now()) { const s = seasonAt(now); return s && seasonPref(s) ? s : null; }
// 게임월드 허브 카드용: 시즌 키 아트와 끝나는 시각을 적어 둔다 (허브는 이 값만 읽는다)
export function syncHub(now = Date.now()) {
  const s = activeSeason(now);
  try { if (s && s.keyart) localStorage.setItem('langbang:seasonArt', JSON.stringify({ art: s.keyart, until: seasonEnd(s, now) })); else localStorage.removeItem('langbang:seasonArt'); } catch { /* 무시 */ }
}
// 로비 장식 (박쥐 · 호박등 · 안개) — 연출 줄이기면 움직이지 않는 것만 (style.css 가 body.rm 에서 멈춘다)
export function seasonFxHtml(s) {
  if (!s || s.fx !== 'halloween') return '';
  const bats = Array.from({ length: 5 }, (_, i) => `<i class="bat" style="--i:${i};--y:${12 + ((i * 29) % 46)}%;--d:${(i * 2.3).toFixed(1)}s;--s:${(0.7 + (i % 3) * 0.18).toFixed(2)}"></i>`).join('');
  return `<div class="ssn-fx ssn-halloween" aria-hidden="true"><span class="ssn-web l"></span><span class="ssn-web r"></span><span class="ssn-bats">${bats}</span><span class="ssn-fog"></span><span class="ssn-lant l"></span><span class="ssn-lant r"></span></div>`;
}
