// 카드 그림: 직접 만든 HTML/CSS 카드 (외부 이미지 없음)
const SUIT = {
  s: { sym: '♠', name: '스페이드', color: 'black' },
  h: { sym: '♥', name: '하트', color: 'red' },
  d: { sym: '♦', name: '다이아', color: 'red' },
  c: { sym: '♣', name: '클럽', color: 'black' },
};
const RANK_LABEL = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

export function rankLabel(r) { return RANK_LABEL[r] || r; }

export function cardName(code) {
  if (!code || code === '??') return '뒷면 카드';
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
  const style = opts.delay ? ` style="animation-delay:${opts.delay}ms"` : '';
  if (!code) return `<span class="${cls.join(' ')} card-empty" aria-hidden="true"></span>`;
  if (code === '??') {
    return `<span class="${cls.join(' ')} card-back"${style} role="img" aria-label="뒷면 카드"><span class="card-back-mark">찬</span></span>`;
  }
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
