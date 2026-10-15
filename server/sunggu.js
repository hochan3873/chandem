// 강성구 키우기(따로 있는 사이트 https://sunggu-game.vercel.app) 로그인 연동
// 게임월드 계정으로 로그인한 사람에게 '강성구 키우기 출입증'을 만들어 그 사이트로 넘겨 준다.
// 출입증은 Ed25519 서명이라, 그 사이트의 랭킹 서버는 공개 키만으로 확인한다 (찬덤 서버가 자고 있어도 랭킹 등록 가능).
// 출입증으로는 강성구 키우기 랭킹 등록만 할 수 있다 (게임월드 로그인 열쇠는 넘기지 않는다).
const crypto = require('crypto');

const SUNGGU_URL = 'https://sunggu-game.vercel.app/';
const PASS_DAYS = 90;

function createSunggu({ acct, seed }) {
  // 서명 키: 계정 서명 키에서 따로 뽑은 값으로 만든다 → 서버를 다시 켜도 같은 키
  const der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
  const priv = crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const pubKey = crypto.createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(12).toString('base64url');

  function makePass(user, now = Date.now()) {
    const body = Buffer.from(JSON.stringify({ id: user.id, n: user.nickname, exp: now + PASS_DAYS * 24 * 3600 * 1000 })).toString('base64url');
    return `${body}.${crypto.sign(null, Buffer.from(body), priv).toString('base64url')}`;
  }

  // 출입증 확인 (찬덤 안에서 강성구 키우기 관련 기능이 쓸 때): 맞으면 { id, nickname }
  function verifyPass(pass, now = Date.now()) {
    const [body, sig] = String(pass || '').split('.');
    if (!body || !sig) return null;
    let ok = false;
    try { ok = crypto.verify(null, Buffer.from(body), crypto.createPublicKey(priv), Buffer.from(sig, 'base64url')); } catch { return null; }
    if (!ok) return null;
    try { const d = JSON.parse(Buffer.from(body, 'base64url').toString()); return d.id && d.exp > now ? { id: d.id, nickname: d.n } : null; } catch { return null; }
  }

  function router(express) {
    const r = express.Router();
    r.use(express.json({ limit: '1kb' }));
    r.get('/pubkey', (req, res) => { res.set('Cache-Control', 'public, max-age=3600'); res.json({ ok: true, key: pubKey }); });
    // 내 게임월드 로그인으로 출입증 받기 (게임월드 화면에서만 부름 · 같은 주소라 CORS 없음)
    r.post('/pass', async (req, res) => {
      try {
        const u = await acct.me(String(req.headers.authorization || '').replace(/^Bearer /, ''));
        if (!u) return res.status(400).json({ ok: false, message: '다시 로그인해 주세요' });
        res.set('Cache-Control', 'no-store');
        res.json({ ok: true, pass: makePass(u), nickname: u.nickname, url: SUNGGU_URL });
      } catch (e) {
        console.error('[sunggu]', e);
        res.status(500).json({ ok: false, message: '잠시 후 다시 해 주세요' });
      }
    });
    return r;
  }

  return { router, makePass, verifyPass, pubKey };
}

module.exports = { createSunggu, SUNGGU_URL };
