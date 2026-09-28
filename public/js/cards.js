// 카드 그림: 직접 만든 HTML/CSS 카드 (외부 이미지 없음)
const SUIT = {
  s: { sym: '♠', name: '스페이드', color: 'black' },
  h: { sym: '♥', name: '하트', color: 'red' },
  d: { sym: '♦', name: '다이아', color: 'red' },
  c: { sym: '♣', name: '클럽', color: 'black' },
};
const RANK_LABEL = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

export function rankLabel(r) { return RANK_LABEL[r] || r; }

// ── 화투(섯다) ─────────────────────────────────────
// 월: [이름, 꽃 그림, 특별한 패(A) 그림]
const HW = {
  1: ['송학', '🌲', '🕊️'], 2: ['매조', '🌸', '🐦'], 3: ['벚꽃', '🌸', '🎏'], 4: ['흑싸리', '🌿', '🐦'], 5: ['난초', '🪻', '🌉'],
  6: ['모란', '🌺', '🦋'], 7: ['홍싸리', '🍂', '🐗'], 8: ['공산', '🌾', '🌕'], 9: ['국화', '🌼', '🍶'], 10: ['단풍', '🍁', '🦌'],
};
const isHwatu = (code) => /^(10|[1-9])[AB]$/.test(code || '');
let deckStyle = 'poker';
/** 뒷면 모양: 'poker' | 'hwatu' */
export function setDeckStyle(s) { deckStyle = s; }

function hwatuHTML(code, cls, style) {
  const m = parseInt(code, 10);
  const special = code.endsWith('A');
  const [name, flower, art] = HW[m];
  const gwang = special && [1, 3, 8].includes(m);
  const yeol = special && [4, 7, 9].includes(m);
  cls.push('hwatu', `hw-m${m}`);
  if (gwang) cls.push('hw-gwang');
  return `<span class="${cls.join(' ')}"${style} role="img" aria-label="${m}월 ${name}${gwang ? ' 광' : yeol ? ' 열끗' : ''}">`
    + `<b class="hw-num">${m}</b><span class="hw-art">${special ? art : flower}</span><span class="hw-name">${name}</span>`
    + `${gwang ? '<i class="hw-mark hw-mark-g">光</i>' : yeol ? '<i class="hw-mark hw-mark-y">열</i>' : ''}</span>`;
}

export function cardName(code) {
  if (!code || code === '??') return '뒷면 카드';
  if (isHwatu(code)) return `${parseInt(code, 10)}월 ${HW[parseInt(code, 10)][0]}`;
  return `${SUIT[code[1]].name} ${rankLabel(code[0])}`;
}

/**
 * code: "As" | "??"(뒷면) | null(빈 자리)
 * opts: { size: 'sm'|'md'|'lg', anim: bool, highlight: bool, dim: bool, delay: ms }
 */
export function cardHTML(code, opts = {}) {
  const size = opts.size || 'md';
  const cls = ['card', `card-${size}`];
  if (opts.anim) cls.push('card-deal');
  if (opts.highlight) cls.push('card-hl');
  if (opts.dim) cls.push('card-dim');
  if (opts.cls) cls.push(opts.cls);
  const style = opts.delay ? ` style="animation-delay:${opts.delay}ms"` : '';
  if (!code) return `<span class="${cls.join(' ')} card-empty" aria-hidden="true"></span>`;
  if (code === '??') {
    if (deckStyle === 'hwatu') return `<span class="${cls.join(' ')} hwatu hw-back"${style} role="img" aria-label="뒷면 화투"><span class="hw-back-mark">찬</span></span>`;
    return `<span class="${cls.join(' ')} card-back"${style} role="img" aria-label="뒷면 카드"><span class="card-back-mark">찬</span></span>`;
  }
  if (isHwatu(code)) return hwatuHTML(code, cls, style);
  const s = SUIT[code[1]];
  const r = rankLabel(code[0]);
  cls.push(`suit-${s.color}`, `suit-${code[1]}`);
  return `<span class="${cls.join(' ')}"${style} role="img" aria-label="${s.name} ${r}">`
    + `<span class="card-corner"><b>${r}</b><i>${s.sym}</i></span>`
    + `<span class="card-pip">${s.sym}</span>`
    + `</span>`;
}

export function cardsHTML(codes, opts = {}) {
  return (codes || []).map((c, i) => cardHTML(c, { ...opts, delay: opts.stagger ? i * opts.stagger : 0 })).join('');
}
