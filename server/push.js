'use strict';
// 랑방 대전 — 웹 푸시 알림 (체력 가득 · 출석 · 건물주 출몰 · 오랜만이에요 · 손님 로그인 안내)
//  열쇠(VAPID)는 환경 변수에서만: VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY · VAPID_SUBJECT(없으면 사이트 주소)
//  열쇠가 없으면 알림 기능 전체가 꺼진다 ({ ok:false, disabled:true }) — 화면도 알림 받기 카드를 숨긴다.
//  보내기: POST /api/push/tick (헤더 x-push-key = PUSH_TICK_KEY) — 깃허브 액션이 한 시간마다 부른다 + 서버가 깨어 있는 동안 15분마다 스스로.
//  규칙: 구독 하나에 하루(KST) 최대 2번 · 밤 22시~아침 9시엔 안 보냄 · 같은 종류는 20시간 안에 다시 안 보냄.
//  구독 저장: DATABASE_URL 이 있으면 계정 저장소의 PostgreSQL(push_subs 표), 없으면 JSON 파일(로컬·테스트).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { isMasterName } = require('./masters');

let LIVE = null, RAID = null; // 화면과 같은 공식 (public/langbang/live.js · raid2.js)
const liveDir = path.join(__dirname, '..', 'public', 'langbang');
const pushReady = Promise.all([
  import(pathToFileURL(path.join(liveDir, 'live.js')).href).then((m) => { LIVE = m; }),
  import(pathToFileURL(path.join(liveDir, 'raid2.js')).href).then((m) => { RAID = m; }),
]).catch((e) => console.error('[push] 공식 불러오기 실패:', e.message));

const HOUR = 3600e3, DAY = 24 * HOUR, KST = 9 * HOUR;
const RULES = { perDay: 2, quietFrom: 22, quietTo: 9, sameKindMs: 20 * HOUR, checkinFromH: 18, idleMs: 3 * DAY, comebackEvery: 3 * DAY, guestEvery: 4 * DAY, guestFirstAfter: DAY, staminaIdleMs: HOUR };
const KINDS = {
  stamina: { title: '체력이 꽉 찼어요! ⚡', body: '진상들이 랑방 앞에 줄 섰어요', url: '/langbang/' },
  checkin: { title: '출석 보상 대기 중 🎁', body: '오늘 출석 보상 아직 안 받았어요 🎁', url: '/langbang/' },
  raid: { title: '건물주 대마왕 출몰! 👊', body: '건물주 대마왕이 나타났어요! 같이 때리러 가요 👊', url: '/langbang/' },
  comeback: { title: '오랜만이에요 🥺', body: '랑방이 진상들한테 털리고 있어요… 지켜 줄 사람? 🥺', url: '/langbang/' },
  guest: { title: '기록 지키기 🔒', body: '로그인하면 기록이 안전하게 저장돼요 · 친구랑 랭킹 경쟁도!', url: '/?login=1&next=langbang' },
};
const USER_KINDS = ['raid', 'stamina', 'checkin', 'comeback']; // 먼저 볼 순서
const ALL_KINDS = Object.keys(KINDS);

const kstDay = (now) => Math.floor((now + KST) / DAY);
const kstHour = (now) => new Date(now + KST).getUTCHours();
const quiet = (now) => { const h = kstHour(now); return h >= RULES.quietFrom || h < RULES.quietTo; };

// ── 저장소 ──────────────────────────────────────────
class FilePushStore {
  constructor(file) {
    this.file = file;
    this.data = { subs: {} };
    if (file && fs.existsSync(file)) { try { this.data = { subs: {}, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch {} }
  }
  async init() {}
  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data));
    fs.renameSync(this.file + '.tmp', this.file);
  }
  async list() { return Object.values(this.data.subs); }
  async get(endpoint) { return this.data.subs[endpoint] || null; }
  async put(s) { this.data.subs[s.endpoint] = s; this.save(); return s; }
  async putMany(list) { for (const s of list) this.data.subs[s.endpoint] = s; if (list.length) this.save(); }
  async remove(endpoint) { const had = !!this.data.subs[endpoint]; delete this.data.subs[endpoint]; if (had) this.save(); return had; }
}
class PgPushStore {
  constructor(pool) { this.pool = pool; }
  async init() { await this.pool.query('CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, data JSONB NOT NULL)'); }
  async list() { return (await this.pool.query('SELECT data FROM push_subs')).rows.map((r) => r.data); }
  async get(endpoint) { const r = (await this.pool.query('SELECT data FROM push_subs WHERE endpoint=$1', [endpoint])).rows[0]; return r ? r.data : null; }
  async put(s) { await this.pool.query('INSERT INTO push_subs (endpoint, data) VALUES ($1,$2) ON CONFLICT (endpoint) DO UPDATE SET data=EXCLUDED.data', [s.endpoint, s]); return s; }
  async putMany(list) { for (const s of list) await this.put(s); }
  async remove(endpoint) { return (await this.pool.query('DELETE FROM push_subs WHERE endpoint=$1', [endpoint])).rowCount > 0; }
}
function createPushStore({ pool = null, file = null } = {}) { return pool ? new PgPushStore(pool) : new FilePushStore(file); }

// ── 받은 구독 정리 ──────────────────────────────────
function cleanSub(raw) {
  const s = raw && typeof raw === 'object' ? raw : null;
  const ep = s && typeof s.endpoint === 'string' ? s.endpoint : '';
  if (!/^https:\/\/[^\s]{8,}$/.test(ep) || ep.length > 1000) return null;
  const k = s.keys || {};
  if (typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || k.p256dh.length > 200 || k.auth.length > 100 || !k.p256dh || !k.auth) return null;
  return { endpoint: ep, keys: { p256dh: k.p256dh, auth: k.auth } };
}
const cleanKinds = (k) => (Array.isArray(k) ? ALL_KINDS.filter((x) => k.includes(x)) : ALL_KINDS.slice());
const cleanDevice = (d) => (typeof d === 'string' && /^[\w-]{6,64}$/.test(d) ? d : null);

// ── 언제 무엇을 보낼까 (순수 함수 · 테스트용) ─────────
//  sub: 저장된 구독 · lb: 로그인 사용자의 랑방 기록(없으면 손님) · 돌려주는 값: 종류 이름 또는 null
function dueKind(sub, lb, now, { master = false } = {}) {
  if (!sub || sub.enabled === false) return null;
  if (quiet(now)) return null;
  const day = kstDay(now);
  if (sub.day === day && (sub.sentToday | 0) >= RULES.perDay) return null;
  const last = sub.last || {};
  const want = new Set(Array.isArray(sub.kinds) ? sub.kinds : ALL_KINDS);
  const ok = (k) => want.has(k) && !(now - (last[k] || 0) < RULES.sameKindMs);
  if (!sub.userId) { // 손님 기기: 로그인 안내만
    if (ok('guest') && now - (sub.createdAt || 0) >= RULES.guestFirstAfter && now - (last.guest || 0) >= RULES.guestEvery) return 'guest';
    return null;
  }
  if (!lb || !LIVE) return null;
  const active = LIVE.lastActive(lb) || sub.createdAt || 0;
  const idle = now - active;
  // 사흘 넘게 안 들어왔으면 "오랜만이에요" 하나만 (사흘에 한 번)
  if (idle >= RULES.idleMs) return ok('comeback') && now - (last.comeback || 0) >= RULES.comebackEvery ? 'comeback' : null;
  for (const k of USER_KINDS) {
    if (!ok(k)) continue;
    if (k === 'raid') {
      const wi = LIVE.weekIndex(now);
      const unlocked = RAID ? RAID.r2Unlocked(lb) : (lb.maxStage | 0) >= 5;
      const r = lb.raid2 || {};
      const entered = r.wi === wi && ((r.used | 0) > 0 || !!r.run);
      if (unlocked && !entered && sub.raidWi !== wi) return k;
    } else if (k === 'stamina') {
      if (master) continue; // 마스터는 체력을 안 쓴다
      // 가득 찼고 · 마지막으로 논 뒤 한 시간 넘게 지났고 · 그 뒤로 이 알림을 아직 안 보냈을 때
      if (LIVE.staminaNow(lb, now).v >= LIVE.STAMINA.max && idle >= RULES.staminaIdleMs && (last.stamina || 0) < active) return k;
    } else if (k === 'checkin') {
      if (kstHour(now) >= RULES.checkinFromH && !LIVE.checkinState(lb, now).done) return k;
    }
  }
  return null;
}
// 보냈다고 적기
function markSent(sub, kind, now) {
  const day = kstDay(now);
  if (sub.day !== day) { sub.day = day; sub.sentToday = 0; }
  sub.sentToday = (sub.sentToday | 0) + 1;
  sub.last = { ...(sub.last || {}), [kind]: now };
  sub.lastSentAt = now;
  if (kind === 'raid' && LIVE) sub.raidWi = LIVE.weekIndex(now);
}
const payloadOf = (kind) => { const k = KINDS[kind]; return { title: k.title, body: k.body, tag: 'lb-' + kind, url: k.url }; };

// 동시에 n 개씩
async function pool(items, n, fn) {
  let i = 0;
  const run = async () => { while (i < items.length) { const it = items[i++]; await fn(it); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
}

function createPush({ acct = null, store = null, env = process.env, now = Date.now, sender = null, concurrency = 6 } = {}) {
  const pub = String(env.VAPID_PUBLIC_KEY || '').trim(), priv = String(env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(env.VAPID_SUBJECT || '').trim() || 'https://chandem.onrender.com';
  const enabled = !!(pub && priv);
  const tickKey = String(env.PUSH_TICK_KEY || '');
  const st = store || createPushStore({});
  const ready = Promise.all([st.init(), pushReady]).catch((e) => console.error('[push] 저장소 준비 실패:', e.message));
  let webpush = null;
  // 보내기: 실패하면 statusCode 가 붙은 오류를 던진다 (404·410 = 구독이 사라짐 → 지운다)
  const send = sender || (async (sub, payload) => {
    if (!webpush) { webpush = require('web-push'); webpush.setVapidDetails(subject, pub, priv); }
    return webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'normal' });
  });
  async function deliver(sub, payload) {
    try { await send(sub, payload); return 'sent'; }
    catch (e) {
      const code = e && e.statusCode;
      if (code === 404 || code === 410) { await st.remove(sub.endpoint); return 'gone'; }
      console.warn('[push] 보내기 실패:', code || (e && e.message));
      return 'fail';
    }
  }
  async function lbOfUser(uid, cache) {
    if (!acct || !uid) return null;
    if (cache.has(uid)) return cache.get(uid);
    let v = null;
    try { const u = await acct.store.byId(uid); if (u && !(u.meta && (u.meta.deleted || u.meta.banned))) v = { lb: (u.stats && u.stats.langbang) || {}, master: isMasterName(u.username) }; } catch { v = null; }
    cache.set(uid, v);
    return v;
  }
  let running = null;
  async function tick() {
    if (!enabled) return { disabled: true };
    if (running) return running; // 겹쳐 부르면 같은 결과를 기다린다
    running = (async () => {
      await ready;
      const t = now();
      const out = { checked: 0, sent: 0, removed: 0, failed: 0, kinds: {} };
      if (quiet(t)) return { ...out, quiet: true };
      const subs = await st.list();
      out.checked = subs.length;
      const cache = new Map(), dirty = [];
      await pool(subs, concurrency, async (sub) => {
        const info = sub.userId ? await lbOfUser(sub.userId, cache) : null;
        if (sub.userId && !info) return;
        const kind = dueKind(sub, info && info.lb, t, { master: !!(info && info.master) });
        if (!kind) return;
        const r = await deliver(sub, payloadOf(kind));
        if (r === 'sent') { markSent(sub, kind, t); dirty.push(sub); out.sent++; out.kinds[kind] = (out.kinds[kind] | 0) + 1; }
        else if (r === 'gone') out.removed++;
        else out.failed++;
      });
      await st.putMany(dirty);
      return out;
    })().finally(() => { running = null; });
    return running;
  }

  function router(express) {
    const r = express.Router();
    r.use(express.json({ limit: '4kb' }));
    const uidOf = (req) => { const t = String(req.headers.authorization || '').replace(/^Bearer /, ''); return t && acct ? acct.verifyToken(t) : null; };
    const wrap = (fn) => async (req, res) => {
      try { const v = await fn(req, res); if (v !== undefined) res.json(v); }
      catch (e) { console.error('[push]', e); res.status(500).json({ ok: false, message: '잠시 후 다시 해 주세요' }); }
    };
    const off = { ok: false, disabled: true, message: '알림 기능이 꺼져 있어요' };
    r.get('/key', (req, res) => res.json(enabled ? { ok: true, key: pub } : off));
    r.post('/subscribe', wrap(async (req, res) => {
      if (!enabled) return off;
      await ready;
      const body = req.body || {};
      const sub = cleanSub(body.subscription);
      if (!sub) { res.status(400).json({ ok: false, message: '알림 구독 정보가 이상해요' }); return; }
      const uid = uidOf(req), dev = cleanDevice(body.deviceId);
      const old = await st.get(sub.endpoint);
      const t = now();
      const s = { ...(old || { createdAt: t, last: {}, day: kstDay(t), sentToday: 0, lastSentAt: 0 }), ...sub, userId: uid || null, deviceId: dev || (old && old.deviceId) || null, kinds: cleanKinds(body.kinds), enabled: body.enabled !== false, updatedAt: t };
      await st.put(s);
      return { ok: true, kinds: s.kinds, user: !!s.userId };
    }));
    r.post('/unsubscribe', wrap(async (req) => {
      if (!enabled) return off;
      await ready;
      const ep = String((req.body || {}).endpoint || '');
      return { ok: true, removed: ep ? await st.remove(ep) : false };
    }));
    r.post('/tick', wrap(async (req, res) => {
      const k = String(req.headers['x-push-key'] || '');
      const good = tickKey && k.length === tickKey.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(tickKey));
      if (!good) { res.status(403).json({ ok: false, message: '권한이 없어요' }); return; }
      if (!enabled) return off;
      return { ok: true, ...(await tick()) };
    }));
    // 마스터 시험 알림: 내 계정으로 구독한 기기에 바로 하나 보낸다 (규칙 무시)
    r.post('/test', wrap(async (req, res) => {
      const uid = uidOf(req);
      const u = uid && acct ? await acct.store.byId(uid) : null;
      if (!u || !isMasterName(u.username)) { res.status(403).json({ ok: false, message: '마스터만 쓸 수 있어요' }); return; }
      if (!enabled) return off;
      await ready;
      const kind = KINDS[(req.body || {}).kind] ? req.body.kind : null;
      const mine = (await st.list()).filter((s) => s.userId === uid);
      let sent = 0;
      for (const s of mine) if ((await deliver(s, kind ? payloadOf(kind) : { title: '랑방 대전 알림 시험 🔔', body: '알림이 잘 와요! 이제 체력 가득 · 출석 · 건물주 출몰을 알려 드릴게요', tag: 'lb-test', url: '/langbang/' })) === 'sent') sent++;
      return { ok: true, subs: mine.length, sent };
    }));
    return r;
  }

  return { enabled, publicKey: enabled ? pub : null, store: st, ready, tick, router, dueKind, markSent };
}

module.exports = { createPush, createPushStore, FilePushStore, PgPushStore, dueKind, markSent, RULES, KINDS, kstDay, kstHour, quiet, cleanSub, pushReady };
