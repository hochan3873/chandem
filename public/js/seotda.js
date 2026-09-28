// 섯다 족보 (서버 server/games/seotda.js 와 같은 규칙)
const month = (c) => parseInt(c, 10);
const isGwang = (c) => c.endsWith('A') && [1, 3, 8].includes(month(c));
const isYeol = (c) => c.endsWith('A') && [4, 7, 9].includes(month(c));
const MID = { '1-2': ['알리', 806], '1-4': ['독사', 805], '1-9': ['구삥', 804], '1-10': ['장삥', 803], '4-10': ['장사', 802], '4-6': ['세륙', 801] };

export function rankSeotda(a, b) {
  const ma = month(a), mb = month(b);
  const lo = Math.min(ma, mb), hi = Math.max(ma, mb);
  const g = [a, b].filter(isGwang).map(month).sort((x, y) => x - y);
  if (g.length === 2) {
    if (g[0] === 3 && g[1] === 8) return { rank: 1000, name: '38광땡', tier: 'gwang' };
    if (g[0] === 1 && g[1] === 8) return { rank: 990, name: '18광땡', tier: 'gwang' };
    if (g[0] === 1 && g[1] === 3) return { rank: 980, name: '13광땡', tier: 'gwang' };
  }
  if (ma === mb) return { rank: 900 + ma, name: ma === 10 ? '장땡' : ma === 1 ? '삥땡' : `${ma}땡`, tier: 'ddaeng' };
  const both = [a, b];
  if (lo === 3 && hi === 7 && both.some((c) => isGwang(c)) && both.some((c) => isYeol(c))) return { rank: 700, name: '땡잡이', tier: 'kkeut' };
  if (lo === 4 && hi === 7 && both.every(isYeol)) return { rank: 701, name: '암행어사', tier: 'kkeut' };
  if (lo === 4 && hi === 9) return { rank: 703, name: both.every(isYeol) ? '멍텅구리구사' : '구사', tier: 'kkeut' };
  const mid = MID[`${lo}-${hi}`];
  if (mid) return { rank: mid[1], name: mid[0], tier: 'mid' };
  const k = (ma + mb) % 10;
  return { rank: 700 + k, name: k === 9 ? '갑오' : k === 0 ? '망통' : `${k}끗`, tier: 'kkeut' };
}

export function seotdaChartHTML() {
  const rows = [
    ['38광땡', '3월 광 + 8월 광', '최강'], ['18·13광땡', '광 두 장', ''], ['장땡', '10월 두 장', '땡 중 최고'], ['9땡 ~ 삥땡', '같은 월 두 장', '숫자가 클수록 강함'],
    ['알리', '1 + 2', ''], ['독사', '1 + 4', ''], ['구삥', '1 + 9', ''], ['장삥', '1 + 10', ''], ['장사', '4 + 10', ''], ['세륙', '4 + 6', ''],
    ['갑오 ~ 1끗', '두 장 합의 끝자리', '9가 갑오'], ['망통', '끝자리 0', '가장 약함'],
  ];
  const special = [
    ['땡잡이', '3월 광 + 7월 열끗', '1~9땡을 잡음 (아니면 망통)'], ['암행어사', '4월 열끗 + 7월 열끗', '13·18광땡을 잡음 (아니면 1끗)'],
    ['구사', '4 + 9', '상대가 알리 이하면 재경기'], ['멍텅구리구사', '4월 열끗 + 9월 열끗', '상대가 9땡 이하면 재경기'],
  ];
  const t = (list) => `<ul class="chart-list">${list.map(([n, how, note]) => `<li><b>${n}</b><span>${how}</span>${note ? `<small class="muted">${note}</small>` : ''}</li>`).join('')}</ul>`;
  return `<p class="muted small">위에서부터 강한 순서예요. 같은 족보면 판돈을 나눠 가져요.</p>${t(rows)}<h3 class="sub-title">특수 패</h3>${t(special)}`;
}
