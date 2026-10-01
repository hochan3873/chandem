'use strict';
// lb-balance.js 를 장(--ch)마다 따로 띄워서 한꺼번에 돌린다 (코어 여러 개) — 출력은 장 순서대로 이어 붙임
//   node scripts/lb-par.js deck --ch=2,3,4,5,6 --seeds=12 [그 밖의 lb-balance.js 옵션]
const { spawn } = require('child_process');
const path = require('path');
const args = process.argv.slice(2);
const chArg = args.find((x) => x.startsWith('--ch='));
const chs = (chArg ? chArg.slice(5) : '2,3,4,5,6').split(',');
const rest = args.filter((x) => x !== chArg);
const t0 = Date.now();
Promise.all(chs.map((c) => new Promise((res) => {
  const p = spawn(process.execPath, [path.join(__dirname, 'lb-balance.js'), ...rest, `--ch=${c}`]);
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', () => res(out));
}))).then((outs) => {
  outs.forEach((o, i) => { process.stdout.write(o.split('\n').filter((l) => (i === 0 || !/^■|^ {2}균형 =|^장 |카드 고르기/.test(l)) && !/^\(\d+(\.\d+)?초\)$/.test(l.trim())).join('\n') + '\n'); });
  console.log(`(병렬 ${chs.length}개 · ${((Date.now() - t0) / 1000).toFixed(1)}초)`);
});
