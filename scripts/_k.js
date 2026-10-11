// 임시: fit*.txt 로 기울기 k 를 스테이지별 r50 자유롭게 하고 최대우도로 (node scripts/_k.js fit [장])
const fs = require('fs'), path = require('path');
const dir = 'C:/Users/리호찬/AppData/Local/Temp/claude/C-------------------------/52850949-034d-498d-bc2d-bdb406ed5ca0/scratchpad/recpower';
const pre = process.argv[2] || 'fit', only = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
const st = [];
for (const f of fs.readdirSync(dir).filter((x) => x.startsWith(pre) && x.endsWith('.txt')).sort()) {
  for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
    const m = line.match(/^(\d+)-(\d+)\s+이긴 판 (.*?) · r50/); if (!m) continue;
    const c = +m[1]; if (only && !only.includes(c)) continue;
    const pts = [...m[3].matchAll(/([\d.]+)→(\d+)\/(\d+)/g)].map((x) => [+x[1], +x[2], +x[3]]);
    if (pts.every((p) => p[1] === 0) || pts.every((p) => p[1] === p[2])) continue; // 정보 없는 스테이지는 뺀다
    st.push(pts);
  }
}
let best = [0, -1e18];
for (let k = 1; k <= 12; k += 0.5) {
  let tot = 0;
  for (const pts of st) {
    let bl = -1e18;
    for (let x = Math.log(0.2); x <= Math.log(4); x += 0.02) {
      let ll = 0; for (const [r, w, n] of pts) { const p = Math.min(0.999, Math.max(0.001, 1 / (1 + Math.exp(-k * (Math.log(r) - x))))); ll += w * Math.log(p) + (n - w) * Math.log(1 - p); }
      if (ll > bl) bl = ll;
    }
    tot += bl;
  }
  console.log('k', k, tot.toFixed(1));
  if (tot > best[1]) best = [k, tot];
}
console.log('stages', st.length, 'best k', best[0]);
