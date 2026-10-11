// 임시: fit*.txt 의 RECADJ 줄을 모아 장별 평균으로 조금 당겨 REC_ADJ 표로 (node scripts/_mk.js 접두사 [shrink])
const fs = require('fs'), path = require('path');
const dir = 'C:/Users/리호찬/AppData/Local/Temp/claude/C-------------------------/52850949-034d-498d-bc2d-bdb406ed5ca0/scratchpad/recpower';
const pre = process.argv[2] || 'fit', shrink = Number(process.argv[3] || 0.3), lo = Number(process.argv[4] || 0.3);
const all = {};
for (const f of fs.readdirSync(dir).filter((x) => x.startsWith(pre) && x.endsWith('.txt')).sort()) {
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const m of t.matchAll(/^(\d+)-(\d+)\s.*보정 ×([\d.]+) → ([\d.]+)/gm)) all[(+m[1] - 1) * 10 + +m[2]] = Number(process.argv[5] === 'abs' ? m[4] : m[3]); // fresh 로 잰 파일은 ×값이 곧 보정
}
const byC = {};
for (const [s, v] of Object.entries(all)) (byC[Math.ceil(s / 10)] = byC[Math.ceil(s / 10)] || []).push(v);
const gm = {}; for (const [c, a] of Object.entries(byC)) gm[c] = Math.exp(a.reduce((x, y) => x + Math.log(y), 0) / a.length);
const out = {};
for (const [s, v] of Object.entries(all)) { const c = Math.ceil(s / 10); out[s] = Math.min(Number(process.argv[6] || 9), Math.max(lo, +(Math.exp(Math.log(v) * (1 - shrink) + Math.log(gm[c]) * shrink)).toFixed(2))); }
for (const c of Object.keys(gm)) console.log(c + '장 평균 ×' + gm[c].toFixed(2));
console.log(JSON.stringify(out));
