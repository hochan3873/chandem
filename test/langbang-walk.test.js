'use strict';
// 폰 높이(H)가 달라도 진상이 입구까지 걸리는 시간은 같다 (walkDistMul)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const load = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
let D, S;
test.before(async () => { D = await load('data.js'); S = await load('sim.js'); });

function timeToDoor(H) {
  const g = S.createGame({ H, rng: () => 0.5, mode: 'stage', stage: 1, noWaves: true, heroes: [], god: true });
  const e = S.spawnEnemy(g, 'drunk', 180, D.FIELD.spawnY);
  e.stopY = g.ropeY; e.speed = 40; e.baseSpeed = 40;
  let t = 0;
  while (!e.atRope && t < 60) { S.step(g, 1 / 30); t += 1 / 30; }
  return t;
}

test('H 640/720/800 에서 입구까지 걸리는 시간이 같다', () => {
  const t = [640, 720, 800].map(timeToDoor);
  for (const x of t) assert.ok(x < 59, 'reached');
  assert.ok(Math.abs(t[0] - t[1]) < 0.2 && Math.abs(t[2] - t[1]) < 0.2, t.join(','));
});

test('H 720 은 배율 1', () => { assert.equal(D.walkDistMul(720), 1); });
