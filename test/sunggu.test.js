'use strict';
// 강성구 키우기(따로 있는 사이트) 로그인 출입증: 로그인한 사람만 · 공개 키로 서명 확인 · 바꾸면 무효
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createServer } = require('../server/index');

let srv, base;
test.before(async () => {
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  base = `http://127.0.0.1:${await srv.listen()}`;
});
test.after(async () => { await srv.close(); });
let ipN = 0;
const req = (method, url, body, token) => fetch(base + url, {
  method, headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${ipN >> 8}.${ipN++ & 255}`, ...(token ? { authorization: 'Bearer ' + token } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then((r) => r.json());

const verify = (pass, key) => {
  const [body, sig] = pass.split('.');
  const pub = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(key, 'base64url')]), format: 'der', type: 'spki' });
  return crypto.verify(null, Buffer.from(body), pub, Buffer.from(sig, 'base64url')) ? JSON.parse(Buffer.from(body, 'base64url').toString()) : null;
};

test('강성구 키우기 출입증: 로그인해야 받음 · 공개 키로 확인 · 내용 바꾸면 무효', async () => {
  assert.equal((await req('POST', '/api/sunggu/pass')).ok, false, '로그인 안 하면 못 받음');
  assert.equal((await req('POST', '/api/sunggu/pass', null, 'a.1.0.x')).ok, false, '가짜 토큰');
  const a = await req('POST', '/api/site/device-account', { nickname: '성구팬' });
  assert.equal(a.ok, true, a.message);
  const p = await req('POST', '/api/sunggu/pass', null, a.token);
  assert.equal(p.ok, true, p.message);
  assert.equal(p.nickname, '성구팬');
  assert.ok(!p.pass.includes(a.token), '게임월드 로그인 열쇠는 넘기지 않음');
  const { key } = await req('GET', '/api/sunggu/pubkey');
  const d = verify(p.pass, key);
  assert.ok(d, '서명 확인');
  assert.equal(d.id, a.user.id);
  assert.equal(d.n, '성구팬');
  assert.ok(d.exp > Date.now() + 80 * 24 * 3600e3);
  // 다른 사람인 척 내용을 바꾸면 무효
  const fake = Buffer.from(JSON.stringify({ ...d, id: 'someone' })).toString('base64url') + '.' + p.pass.split('.')[1];
  assert.equal(verify(fake, key), null);
  const { createSunggu } = require('../server/sunggu');
  const sg = createSunggu({ acct: srv.accounts, seed: srv.accounts.subKey('sunggu') });
  assert.equal(sg.verifyPass(p.pass).id, a.user.id);
  assert.equal(sg.verifyPass(fake), null);
  // 서버를 다시 켜도 같은 키 (계정 서명 키에서 뽑음)
  assert.equal(srv.accounts.subKey('sunggu').length, 32);
});
