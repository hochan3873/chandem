'use strict';
// 사이트 공용 기능: 공지사항 · 출석 체크 · 계정 관리 · 건의/버그 신고 · 점검 모드
// 관리(마스터) 화면용 API 는 server/admin.js
const crypto = require('crypto');
const { createSiteStore } = require('./site-store');
const { AuthError, hashPassword, checkPassword } = require('./accounts');
const { isMasterName } = require('./masters');

// 출석 보상 (7일 주기, 랑방 코인). 7일째는 큰 보상
const CHECKIN_REWARDS = [50, 60, 80, 100, 120, 150, 300];
const NICK_COOLDOWN_MS = 24 * 3600 * 1000;
const FEEDBACK_GAP_MS = 30 * 1000;       // 연속 제출 간격
const FEEDBACK_PER_HOUR = 5;
const FEEDBACK_CATS = { bug: '버그 신고', idea: '건의', game: '게임 밸런스', etc: '기타' };
const GAMES = { holdem: '홀덤', seotda: '섯다', omok: '오목', langbang: '랑방 대전', site: '사이트 전체' };

// KST(한국 시간) 기준 날짜 'YYYY-MM-DD'
const kstDay = (t) => new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 닉네임 가벼운 욕설 거르기 (띄어쓰기·기호를 빼고 검사)
const BAD_WORDS = ['시발', '씨발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '개새', '새끼', '좆', '존나', 'ㅈㄴ', '썅', '니미', '느금', '애미', '애비', '지랄', '엠창', '창녀', '보지', '자지', '섹스', 'fuck', 'shit', 'bitch', 'sex'];
const RESERVED = ['마스터', '운영자', '관리자', '운영진', 'admin', 'master', 'gm', '찬이의게임월드'];
const squash = (s) => String(s).toLowerCase().replace(/[\s\-_.·~!@#$%^&*()+=|\\/?,<>'"`;:[\]{}]/g, '');
function cleanNickname(raw) { return String(raw || '').replace(/\s+/g, ' ').trim(); }
/** 닉네임 규칙 검사 → 문제 있으면 메시지, 괜찮으면 null */
function nicknameProblem(nick, { master = false } = {}) {
  if (!nick) return '닉네임을 입력해 주세요';
  if (nick.length > 10) return '닉네임은 10자까지예요';
  if (/[<>]/.test(nick) || /[\u0000-\u001f]/.test(nick)) return '쓸 수 없는 글자가 들어 있어요';
  const sq = squash(nick);
  if (!sq) return '글자나 숫자를 넣어 주세요';
  if (BAD_WORDS.some((w) => sq.includes(w))) return '고운 말로 지어 주세요 🙏';
  if (!master && RESERVED.some((w) => sq === w || (w.length >= 3 && sq.includes(w)))) return '운영자처럼 보이는 닉네임은 쓸 수 없어요';
  return null;
}

const newId = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const tokOf = (req) => String(req.headers.authorization || '').replace(/^Bearer /, '');
const ipOf = (req) => String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim();
const clip = (s, n) => String(s == null ? '' : s).replace(/\r\n/g, '\n').trim().slice(0, n);

function createSite({ acct, file = null, now = Date.now } = {}) {
  const store = createSiteStore(acct.store, file);
  let maintenance = { on: false, message: '' };
  const ready = acct.ready.then(() => store.init()).then(async () => {
    const m = await store.getKv('maintenance');
    if (m) maintenance = { on: !!m.on, message: String(m.message || '') };
  }).catch((e) => { console.error('[site] 저장소 준비 실패:', e.message); });

  // 로그인한 사람 (정지·탈퇴·옛 토큰이면 로그인 필요)
  async function userOf(token) {
    await ready;
    const id = acct.verifyToken(token);
    const u = id ? await acct.store.byId(id) : null;
    if (!u) throw new AuthError('로그인하면 쓸 수 있어요');
    return u;
  }
  // 메타(정지·출석 등) 저장 + 토큰 확인용 캐시 갱신
  async function saveMeta(u, meta) {
    await store.saveMeta(u.id, meta);
    u.meta = meta;
    acct.noteMeta(u.id, meta);
  }
  const metaOf = (u) => ({ ...(u.meta || {}) });

  // ── 점검 모드 ──
  const getMaintenance = () => ({ ...maintenance });
  async function setMaintenance(on, message) {
    await ready;
    maintenance = { on: !!on, message: clip(message, 120) };
    await store.setKv('maintenance', maintenance);
    return getMaintenance();
  }

  // ── 공지 ──
  async function listNotices() { await ready; return store.listNotices(30); }
  function noticeInput(body) {
    const title = clip(body.title, 60);
    const text = clip(body.body, 2000);
    if (!title) throw new AuthError('제목을 입력해 주세요');
    if (!text) throw new AuthError('내용을 입력해 주세요');
    return { title, body: text, important: !!body.important };
  }
  async function createNotice(body, author) {
    await ready;
    const t = now();
    return store.addNotice({ id: newId(), ...noticeInput(body), author: author || null, createdAt: t, updatedAt: t });
  }
  async function updateNotice(id, body) {
    await ready;
    const n = await store.getNotice(String(id));
    if (!n) throw new AuthError('없는 공지예요');
    return store.updateNotice(n.id, { ...noticeInput(body), updatedAt: now() });
  }
  async function deleteNotice(id) {
    await ready;
    if (!(await store.removeNotice(String(id)))) throw new AuthError('없는 공지예요');
    return true;
  }

  // ── 출석 체크 ──
  function checkinView(meta, t = now()) {
    const c = meta.checkin || {};
    const today = kstDay(t), yesterday = kstDay(t - 86400000);
    const claimed = c.last === today;
    const run = claimed || c.last === yesterday ? c.streak | 0 : 0; // 이어지고 있는 연속 일수
    // 7일 주기에서 오늘(받을/받은) 칸
    const day = claimed ? ((run - 1) % 7) + 1 : (run % 7) + 1;
    const days = CHECKIN_REWARDS.map((coins, i) => ({
      day: i + 1, coins,
      state: i + 1 < day ? 'done' : i + 1 === day ? (claimed ? 'done' : 'today') : 'next',
    }));
    return { today, claimed, streak: run, total: c.total | 0, day, reward: CHECKIN_REWARDS[day - 1], rewards: CHECKIN_REWARDS, days };
  }
  async function checkinState(token) { const u = await userOf(token); return { checkin: checkinView(metaOf(u)) }; }
  /** 오늘 출석 (KST 하루 한 번, 두 번 불러도 한 번만 지급) */
  async function checkin(token) {
    const u0 = await userOf(token);
    return acct.exclusive(async () => {
      const u = await acct.store.byId(u0.id);
      if (!u) throw new AuthError('로그인하면 쓸 수 있어요');
      const meta = metaOf(u);
      const t = now();
      const v = checkinView(meta, t);
      if (v.claimed) return { already: true, checkin: v, coins: null };
      const c = { last: v.today, streak: v.streak + 1, total: (v.total | 0) + 1 };
      await saveMeta(u, { ...meta, checkin: c });
      const coins = await acct.addLangbangCoins(u.id, v.reward);
      return { already: false, gained: v.reward, coins, checkin: checkinView({ checkin: c }, t) };
    });
  }

  // ── 계정 관리 ──
  async function changeNickname(token, raw, { byMaster = false, target = null } = {}) {
    const actor = byMaster ? null : await userOf(token);
    const nick = cleanNickname(raw);
    return acct.exclusive(async () => {
      const u = target ? await acct.store.byName(target) : await acct.store.byId(actor.id);
      if (!u) throw new AuthError('없는 사용자예요');
      const bad = nicknameProblem(nick, { master: byMaster || isMasterName(u.username) });
      if (bad) throw new AuthError(bad);
      if (nick === u.nickname) throw new AuthError('지금 닉네임과 같아요');
      const meta = metaOf(u);
      if (!byMaster && meta.nickAt && now() - meta.nickAt < NICK_COOLDOWN_MS) {
        const h = Math.ceil((NICK_COOLDOWN_MS - (now() - meta.nickAt)) / 3600000);
        throw new AuthError(`닉네임은 하루에 한 번 바꿀 수 있어요 (${h}시간 뒤에 다시)`);
      }
      if (await store.nicknameTaken(nick, u.id)) throw new AuthError('이미 누가 쓰고 있는 닉네임이에요');
      await store.setNickname(u.id, nick);
      if (!byMaster) await saveMeta(u, { ...meta, nickAt: now() });
      u.nickname = nick;
      return { user: acct.publicUser(u) };
    });
  }
  async function changePassword(token, current, next) {
    const u0 = await userOf(token);
    const cur = String(current || ''), nx = String(next || '');
    if (nx.length < 6 || nx.length > 64) throw new AuthError('새 비밀번호는 6~64자로 정해 주세요');
    return acct.exclusive(async () => {
      const u = await acct.store.byId(u0.id);
      if (!checkPassword(cur, u.pass)) throw new AuthError('지금 비밀번호가 맞지 않아요');
      if (cur === nx) throw new AuthError('지금과 다른 비밀번호로 정해 주세요');
      await store.setPass(u.id, hashPassword(nx));
      const meta = metaOf(u);
      await saveMeta(u, { ...meta, tv: (meta.tv | 0) + 1 }); // 다른 기기는 로그아웃, 이 기기는 새 토큰
      return { token: acct.makeToken(u.id) };
    });
  }
  async function logoutAll(token) {
    const u0 = await userOf(token);
    return acct.exclusive(async () => {
      const u = await acct.store.byId(u0.id);
      const meta = metaOf(u);
      await saveMeta(u, { ...meta, tv: (meta.tv | 0) + 1 });
      return { done: true };
    });
  }
  async function deleteAccount(token, password) {
    const u0 = await userOf(token);
    return acct.exclusive(async () => {
      const u = await acct.store.byId(u0.id);
      if (!checkPassword(String(password || ''), u.pass)) throw new AuthError('비밀번호가 맞지 않아요');
      await store.removeUser(u.id);
      acct.noteMeta(u.id, { deleted: true });
      return { deleted: true };
    });
  }

  // ── 건의 / 버그 신고 ──
  const fbTimes = new Map(); // 사람(계정 또는 IP) → 최근 제출 시각들
  async function submitFeedback({ token, ip, category, text, game }) {
    await ready;
    let u = null;
    if (token) { try { u = await userOf(token); } catch { u = null; } }
    const body = clip(text, 501);
    if (body.length < 2) throw new AuthError('내용을 조금 더 적어 주세요');
    if (body.length > 500) throw new AuthError('500자까지 적을 수 있어요');
    const cat = FEEDBACK_CATS[category] ? category : 'etc';
    const g = GAMES[game] ? game : null;
    const key = u ? 'u:' + u.id : 'ip:' + (ip || '?');
    const t = now();
    const list = (fbTimes.get(key) || []).filter((x) => t - x < 3600000);
    if (list.length && t - list[list.length - 1] < FEEDBACK_GAP_MS) throw new AuthError('조금 있다가 다시 보내 주세요');
    if (list.length >= FEEDBACK_PER_HOUR) throw new AuthError('한 시간에 5번까지 보낼 수 있어요. 고마워요!');
    list.push(t); fbTimes.set(key, list);
    if (fbTimes.size > 5000) fbTimes.clear();
    await store.addFeedback({ id: newId(), userId: u ? u.id : null, username: u ? u.username : null, nickname: u ? u.nickname : null, category: cat, game: g, text: body, createdAt: t, done: false });
    return { sent: true };
  }

  // 운영 기록 (admin.js 에서 씀)
  async function log(actor, action, target, detail) {
    await ready;
    return store.addLog({ at: now(), actor: String(actor), action, target: target == null ? null : String(target), detail: detail || null });
  }

  // ── HTTP: /api/site ──
  function router(express) {
    const r = express.Router();
    r.use(express.json({ limit: '8kb' }));
    const wrap = (fn) => async (req, res) => {
      try { res.set('Cache-Control', 'no-store').json({ ok: true, ...(await fn(req)) }); }
      catch (e) {
        if (e instanceof AuthError) res.status(e.message.includes('로그인') ? 401 : 400).json({ ok: false, message: e.message });
        else { console.error('[site]', e); res.status(500).json({ ok: false, message: '잠시 후 다시 해 주세요' }); }
      }
    };
    r.get('/status', wrap(async () => { await ready; return { maintenance: getMaintenance() }; }));
    r.get('/notices', wrap(async () => ({ notices: await listNotices() })));
    r.get('/checkin', wrap((req) => checkinState(tokOf(req))));
    r.post('/checkin', wrap((req) => checkin(tokOf(req))));
    r.post('/feedback', wrap((req) => submitFeedback({ token: tokOf(req), ip: ipOf(req), ...(req.body || {}) })));
    r.post('/account/nickname', wrap((req) => changeNickname(tokOf(req), (req.body || {}).nickname)));
    r.post('/account/password', wrap((req) => changePassword(tokOf(req), (req.body || {}).current, (req.body || {}).next)));
    r.post('/account/logout-all', wrap((req) => logoutAll(tokOf(req))));
    r.post('/account/delete', wrap((req) => deleteAccount(tokOf(req), (req.body || {}).password)));
    return r;
  }

  // 랑방 랭킹 응답에 마스터 표시를 덧붙인다 (랑방 코드는 건드리지 않고 응답만 꾸밈)
  function decorateRanking(req, res, next) {
    const json = res.json.bind(res);
    res.json = (body) => {
      if (body && Array.isArray(body.ranking)) for (const x of body.ranking) if (x && x.username) x.isMaster = isMasterName(x.username);
      if (body && body.me && body.me.username) body.me.isMaster = isMasterName(body.me.username);
      return json(body);
    };
    next();
  }

  return {
    ready, store, router, decorateRanking, log, userOf, saveMeta, metaOf,
    maintenance: getMaintenance, setMaintenance,
    listNotices, createNotice, updateNotice, deleteNotice,
    checkin, checkinState, checkinView,
    changeNickname, changePassword, logoutAll, deleteAccount, submitFeedback,
  };
}

module.exports = { createSite, kstDay, nicknameProblem, CHECKIN_REWARDS, FEEDBACK_CATS, GAMES, NICK_COOLDOWN_MS };
