// 도감 첫 발견 보상: 멤버 · 진상 · 장비 처음마다 한 번 + 10개마다 모집권 · 두 번 못 받음
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'live.js')).href);

test('도감 첫 발견 보상: 목록 · 받기 · 다시 못 받음 · 10개마다 모집권', async () => {
  const L = await load();
  const lb = { coins: 0, stones: 0, tickets: 0, shards: {}, seen: ['thug', 'drunk'], gearDex: [], gear: [], heroes: {}, owned: {}, stages: {}, dexRw: [] };
  const list = L.dexRwList(lb);
  assert.ok(list.some((x) => x.k === 'e:thug'), '만난 진상');
  assert.ok(list.some((x) => x.k === 'h:bangjang'), '기본 멤버');
  const n0 = list.length;
  const r = L.dexClaim(lb, 'e:thug', 'u1');
  assert.equal(r.n, 1);
  assert.ok(lb.coins > 0, '코인');
  assert.equal(L.dexRwList(lb).length, n0 - 1);
  assert.ok(L.dexClaim(lb, 'e:thug', 'u1').error, '두 번 못 받음');
  const all = L.dexClaim(lb, 'all', 'u1');
  assert.ok(all.n >= 1);
  assert.equal(L.dexRwList(lb).length, 0);
  // 10개 넘게 모으면 모집권
  lb.seen = Object.keys((await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'data.js')).href)).ENEMIES).slice(0, 14);
  const t0 = lb.tickets | 0;
  L.dexClaim(lb, 'all', 'u1');
  assert.ok((lb.tickets | 0) > t0, '10개마다 모집권');
  // 저장 정리: 이상한 키는 버림
  const out = {}; L.normLive({ dexRw: ['e:thug', 'bad key', 'm:10', 5] }, out);
  assert.deepEqual(out.dexRw, ['e:thug', 'm:10']);
});
