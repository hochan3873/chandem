// 게임별 등급 · 순위 배지 · 선수 카드 · 명예의 전당 · 긴 닉네임 맞추기
//  서버: /api/rank/:game (top 10 + 내 순위) · /api/rank/room/:code (방 안 사람들) · /api/rank/card/:game?code&pid | ?user
let C = null; // { S, esc, fmt, signed, openModal, closeModal, render }
export function init(ctx) { C = ctx; }

const GAME_NAME = { holdem: '♠ 텍사스 홀덤', seotda: '🎴 섯다', omok: '⚫ 오목' };
const LADDER = {
  holdem: '브론즈 칩 → 실버 → 골드 → 플래티넘 → 다이아 → 하이롤러 → 레전드',
  seotda: '초짜 → 선수 → 꾼 → 고수 → 명인 → 신의 손',
  omok: '18급 … 1급 → 초단 … 9단',
};
async function get(url) {
  try {
    const r = await fetch(url, { cache: 'no-store', headers: C.S.auth ? { authorization: 'Bearer ' + C.S.auth } : {} });
    return await r.json();
  } catch { return { ok: false }; }
}

// ── 방 안 사람들 등급 (30초마다 · 사람이 바뀌면 바로) ──
let roomKey = '', roomAt = 0, loading = false;
export function refreshRoom(st) {
  if (!st || !st.room) return;
  const game = (st.room.settings && st.room.settings.game) || 'holdem';
  const key = st.room.code + ':' + game + ':' + st.players.map((p) => p.id).sort().join(',');
  if (loading || (key === roomKey && Date.now() - roomAt < 30000)) return;
  loading = true;
  get(`/api/rank/room/${encodeURIComponent(st.room.code)}?game=${game}`).then((r) => {
    loading = false;
    roomKey = key; roomAt = Date.now();
    if (!r.ok) return;
    const before = JSON.stringify(C.S.ranks || {});
    C.S.ranks = r.ranks || {};
    C.S.ranksTotal = r.total || 0;
    if (JSON.stringify(C.S.ranks) !== before && C.S.view === 'room') C.render();
  });
}
/** 자리·목록에 붙는 작은 배지: 등급 아이콘 + 순위 (손님 · 배치 중 · 마스터) */
export function badgeHTML(pid, { big = false } = {}) {
  const x = C.S.ranks && C.S.ranks[pid];
  if (!x || x.bot) return '';
  const cls = `rk-badge ${big ? 'rk-big' : ''}`;
  if (x.guest) return `<span class="${cls} rk-guest">손님</span>`;
  if (x.master) return '';
  if (!x.tier) return `<span class="${cls} rk-new" title="10판을 채우면 등급이 정해져요">🔰배치</span>`;
  const top = x.rank && x.rank <= 3 ? ` rk-top rk-${x.rank}` : '';
  return `<span class="${cls}${top}" style="--tc:${x.tier.color}" title="${C.esc(x.tier.name)}${x.rank ? ` · ${x.rank}위` : ''}">${x.tier.icon}${x.rank ? `<b>${x.rank}위</b>` : `<b>${C.esc(x.tier.name)}</b>`}</span>`;
}

// ── 선수 카드 ──
const pct = (v) => (v == null ? '-' : v + '%');
function recentHTML(s) {
  if (!s) return '<span class="muted small">아직 기록 없음</span>';
  return `<span class="pc-recent">${[...s].map((c) => `<i class="pc-${c}">${c === 'W' ? '승' : c === 'L' ? '패' : '무'}</i>`).join('')}</span>`;
}
export async function openPlayerCard({ game, code, pid, username, name }) {
  const g = game || 'holdem';
  C.openModal('👤 선수 카드', `<p class="muted">불러오는 중…</p>`);
  const q = username ? `user=${encodeURIComponent(username)}` : `code=${encodeURIComponent(code || '')}&pid=${encodeURIComponent(pid || '')}`;
  const r = await get(`/api/rank/card/${g}?${q}`);
  const body = document.querySelector('#modal-root .modal-body');
  if (!body) return;
  const c = r.ok && r.card;
  if (!c) { body.innerHTML = `<div class="pc"><div class="pc-head"><b class="pc-name">${C.esc(name || '?')}</b></div><p class="muted">기록을 불러오지 못했어요</p></div>`; return; }
  if (c.guest) {
    body.innerHTML = `<div class="pc"><div class="pc-head"><b class="pc-name">${C.esc(c.nickname)}</b><span class="muted small">${c.bot ? '🤖 AI 봇' : '손님'}</span></div>
      <p class="muted small">${c.bot ? '연습 상대 봇이라 기록이 없어요.' : '로그인하지 않은 손님이라 기록이 남지 않아요.'}</p></div>`;
    return;
  }
  const t = c.tier;
  const rows = [['판 수', C.fmt(c.played)], ['승률', c.enough ? pct(c.winRate) : '데이터 부족']];
  if (g === 'omok') rows.push(['점수', `${C.fmt(c.rating)} <small class="muted">최고 ${C.fmt(c.peak)}</small>`], ['승 / 패 / 무', `${c.wins} / ${c.losses} / ${c.draws}`], ['최다 연승', c.bestStreak ? `${c.bestStreak}연승` : '-']);
  else rows.push(['누적 칩', `<span class="${c.net > 0 ? 'plus' : c.net < 0 ? 'minus' : ''}">${C.signed(c.net)}</span>`], ['가장 큰 팟', c.bestPot ? C.fmt(c.bestPot) : '-'], ['최고 족보', c.bestHand ? C.esc(c.bestHand) : '-']);
  body.innerHTML = `<div class="pc">
    <div class="pc-head"><b class="pc-name">${C.esc(c.nickname)}</b>${c.master ? '<span class="mbadge mbadge-sm">👑</span>' : ''}<span class="muted small">${GAME_NAME[g]}</span></div>
    <div class="pc-tier" style="--tc:${t ? t.color : '#9aa1a8'}">
      <span class="pc-ticon">${t ? t.icon : '🔰'}</span>
      <div><b>${t ? C.esc(t.name) : '배치 중'}</b><small>${c.master ? '운영자는 순위에서 빠져요' : t ? (c.rank ? `전체 ${c.rank}위` : '') : `데이터 부족 · ${c.need}판 더 하면 등급이 정해져요`}</small></div>
    </div>
    <div class="stat-grid pc-grid">${rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>
    <div class="pc-form"><span class="muted small">최근 10판</span>${recentHTML(c.recent)}</div>
    <p class="muted tiny">등급: ${LADDER[g]}</p>
  </div>`;
}

// ── 명예의 전당 (게임 화면 맨 위): 1~3위 시상대 · 4~10위 목록 · 내 순위 ──
const avatarOf = (name) => { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `/img/avatars/a${(h % 8) + 1}.webp`; };
const tierTxt = (x) => (x.tier ? `${x.tier.icon} ${C.esc(x.tier.name)}` : '🔰 배치 중');
const subTxt = (game, x) => (game === 'omok' ? `${C.fmt(x.rating)}점 · ${C.fmt(x.played)}판` : `승률 ${x.winRate == null ? '-' : x.winRate + '%'} · ${C.fmt(x.played)}판`);
export function hallHTML(game) {
  return `<section class="panel hall" id="hall"><div class="sec-head"><h2 class="sec-title">🏆 명예의 전당</h2><small class="muted">${LADDER[game]}</small></div>
    <div class="hall-body"><p class="muted small">불러오는 중…</p></div></section>`;
}
export async function loadHall(game) {
  const r = await get(`/api/rank/${game}?n=10`);
  const box = document.querySelector('#hall .hall-body');
  if (!box) return;
  if (!r.ok) { box.innerHTML = '<p class="muted small">순위를 불러오지 못했어요</p>'; return; }
  if (!r.top.length) { box.innerHTML = `<p class="muted small center">아직 기록이 없어요. ${C.S.user ? '한 판 해서 1위에 이름을 올려 봐요!' : '로그인하고 하면 순위에 올라가요!'}</p>`; return; }
  const podium = [r.top[1], r.top[0], r.top[2]].filter(Boolean).map((x) => `
    <button class="pod pod-${x.rank} ${x.me ? 'is-me' : ''}" data-user="${C.esc(x.username)}" style="--tc:${x.tier ? x.tier.color : '#9aa1a8'}">
      <span class="pod-medal">${['🥇', '🥈', '🥉'][x.rank - 1]}</span>
      <span class="pod-av"><img src="${avatarOf(x.username)}" alt=""></span>
      <b class="pod-name fit-name">${C.esc(x.nickname)}</b>
      <span class="pod-tier">${tierTxt(x)}</span>
      <small class="pod-sub">${subTxt(game, x)}</small>
    </button>`).join('');
  const row = (x, cls = '') => `<li class="${x.me ? 'is-me' : ''} ${cls}" data-user="${C.esc(x.username)}">
    <span class="hl-rank">${x.rank}</span>
    <span class="hl-tier" style="--tc:${x.tier ? x.tier.color : '#9aa1a8'}">${tierTxt(x)}</span>
    <b class="hl-name">${C.esc(x.nickname)}</b>
    <small class="muted">${subTxt(game, x)}</small></li>`;
  const rest = r.top.slice(3).map((x) => row(x)).join('');
  let mine = '';
  if (r.me) mine = `<div class="hall-me-lbl">내 순위</div><ol class="hall-list hall-me">${row(r.me, 'is-me')}</ol>`;
  else if (C.S.user) mine = `<p class="hall-me-lbl muted small">내 순위: 아직 기록이 없어요 · 한 판 하면 올라가요!</p>`;
  else mine = `<p class="hall-me-lbl muted small">로그인하면 내 순위가 여기에 떠요</p>`;
  box.innerHTML = `<div class="podium">${podium}</div>${rest ? `<ol class="hall-list">${rest}</ol>` : ''}${mine}`;
  fitNames(box);
  box.querySelectorAll('[data-user]').forEach((el) => { el.onclick = () => openPlayerCard({ game, username: el.dataset.user }); });
}
/** 메인 게임 카드에 1위 한 줄: "👑 1위 여져니 · 하이롤러" */
export async function loadHubChamps(games = ['holdem', 'seotda', 'omok']) {
  await Promise.all(games.map(async (g) => {
    const r = await get(`/api/rank/${g}?n=1`);
    const card = document.querySelector(`.game-card-${g}`);
    const x = r.ok && r.top && r.top[0];
    if (!card || !x || card.querySelector('.gc-champ')) return;
    card.insertAdjacentHTML('beforeend', `<span class="gc-champ" style="--tc:${x.tier ? x.tier.color : '#ffd35a'}">👑 1위 <b>${C.esc(x.nickname)}</b>${x.tier ? ` · ${C.esc(x.tier.name)}` : ''}</span>`);
  }));
}

// ── 긴 닉네임: 칸에 맞게 글자를 줄인다 (최소 9px, 그래도 넘치면 …) ──
export function fitNames(root = document) {
  root.querySelectorAll('.seat-name, .fit-name, .omok-player b, .hall-list .hl-name, .rank-table b, .plist .list-row .grow > b').forEach((el) => {
    if (el.closest('.seat-me') && el.classList.contains('seat-name')) return; // 내 자리는 두 줄로
    el.style.fontSize = '';
    if (el.scrollWidth <= el.clientWidth + 1) return;
    let size = parseFloat(getComputedStyle(el).fontSize) || 12;
    let n = 0;
    while (el.scrollWidth > el.clientWidth + 1 && size > 9 && n++ < 12) { size -= 0.5; el.style.fontSize = size + 'px'; }
  });
}
