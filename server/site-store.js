'use strict';
// 사이트 공용 저장소: 공지 · 건의함 · 운영 기록 · 사이트 설정(점검 모드)
// + 계정 표(users)에 대한 관리용 쿼리(정지·닉네임·비밀번호·탈퇴·검색).
// DATABASE_URL 이 있으면 계정 저장소의 PostgreSQL 풀을 같이 쓰고, 없으면 JSON 파일(로컬·테스트).
const fs = require('fs');
const path = require('path');

const LOG_KEEP = 2000;
const FEEDBACK_KEEP = 3000;
const likeEscape = (s) => String(s).replace(/[\\%_]/g, (c) => '\\' + c);

// ── 파일 ────────────────────────────────────────────
class FileSiteStore {
  constructor(file, userStore) {
    this.file = file;
    this.users = userStore; // accounts.js 의 FileStore
    this.data = { notices: [], feedback: [], log: [], kv: {}, seq: 0 };
    if (file && fs.existsSync(file)) {
      try { this.data = { ...this.data, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch {}
    }
  }
  async init() {}
  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data));
    fs.renameSync(this.file + '.tmp', this.file);
  }
  // 공지
  async listNotices(n = 30) { return this.data.notices.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, n); }
  async getNotice(id) { return this.data.notices.find((x) => x.id === id) || null; }
  async addNotice(n) { this.data.notices.push(n); this.save(); return n; }
  async updateNotice(id, patch) {
    const n = this.data.notices.find((x) => x.id === id);
    if (!n) return null;
    Object.assign(n, patch); this.save(); return n;
  }
  async removeNotice(id) {
    const before = this.data.notices.length;
    this.data.notices = this.data.notices.filter((x) => x.id !== id);
    this.save();
    return this.data.notices.length < before;
  }
  // 건의함
  async addFeedback(f) {
    this.data.feedback.push(f);
    if (this.data.feedback.length > FEEDBACK_KEEP) this.data.feedback = this.data.feedback.slice(-FEEDBACK_KEEP);
    this.save(); return f;
  }
  async listFeedback(n = 100) { return this.data.feedback.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, n); }
  async setFeedbackDone(id, done) {
    const f = this.data.feedback.find((x) => x.id === id);
    if (!f) return null;
    f.done = !!done; this.save(); return f;
  }
  async removeFeedback(id) { this.data.feedback = this.data.feedback.filter((x) => x.id !== id); this.save(); return true; }
  async openFeedbackCount() { return this.data.feedback.filter((x) => !x.done).length; }
  // 운영 기록
  async addLog(e) {
    e.id = ++this.data.seq;
    this.data.log.push(e);
    if (this.data.log.length > LOG_KEEP) this.data.log = this.data.log.slice(-LOG_KEEP);
    this.save(); return e;
  }
  async listLog(n = 100) { return this.data.log.slice(-n).reverse(); }
  // 사이트 설정
  async getKv(k) { return this.data.kv[k] === undefined ? null : this.data.kv[k]; }
  async setKv(k, v) { this.data.kv[k] = v; this.save(); }

  // ── 계정 표 ──
  async saveMeta(id, meta) { const u = this.users.data.users[id]; if (u) { u.meta = meta; this.users.save(); } }
  async setNickname(id, nickname) { const u = this.users.data.users[id]; if (u) { u.nickname = nickname; this.users.save(); } }
  async setPass(id, pass) { const u = this.users.data.users[id]; if (u) { u.pass = pass; this.users.save(); } }
  async removeUser(id) { const had = !!this.users.data.users[id]; delete this.users.data.users[id]; this.users.save(); return had; }
  async nicknameTaken(nickname, exceptId) {
    const n = String(nickname).toLowerCase();
    return Object.values(this.users.data.users).some((u) => u.id !== exceptId && String(u.nickname).toLowerCase() === n);
  }
  async searchUsers(q, n = 20) {
    const s = String(q || '').toLowerCase();
    return Object.values(this.users.data.users)
      .filter((u) => !s || u.username.includes(s) || String(u.nickname).toLowerCase().includes(s))
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, n);
  }
  async userCount() { return Object.keys(this.users.data.users).length; }
  async byNickname(nickname) {
    const n = String(nickname).toLowerCase();
    return Object.values(this.users.data.users).find((u) => String(u.nickname).toLowerCase() === n) || null;
  }
}

// ── PostgreSQL ──────────────────────────────────────
class PgSiteStore {
  constructor(userStore) {
    this.users = userStore; // accounts.js 의 PgStore (pool · row() 를 같이 쓴다)
  }
  get pool() { return this.users.pool; }
  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS notices (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, important BOOLEAN NOT NULL DEFAULT false,
      author TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY, user_id TEXT, username TEXT, nickname TEXT, category TEXT NOT NULL, game TEXT,
      text TEXT NOT NULL, created_at BIGINT NOT NULL, done BOOLEAN NOT NULL DEFAULT false)`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS admin_log (
      id BIGSERIAL PRIMARY KEY, at BIGINT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT, detail JSONB)`);
    await this.pool.query('CREATE TABLE IF NOT EXISTS site_kv (k TEXT PRIMARY KEY, v JSONB NOT NULL)');
  }
  notice(r) { return r && { id: r.id, title: r.title, body: r.body, important: !!r.important, author: r.author, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) }; }
  fb(r) { return r && { id: r.id, userId: r.user_id, username: r.username, nickname: r.nickname, category: r.category, game: r.game, text: r.text, createdAt: Number(r.created_at), done: !!r.done }; }
  async listNotices(n = 30) { return (await this.pool.query('SELECT * FROM notices ORDER BY created_at DESC LIMIT $1', [n])).rows.map((r) => this.notice(r)); }
  async getNotice(id) { return this.notice((await this.pool.query('SELECT * FROM notices WHERE id=$1', [id])).rows[0]); }
  async addNotice(n) {
    await this.pool.query('INSERT INTO notices (id, title, body, important, author, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [n.id, n.title, n.body, !!n.important, n.author || null, n.createdAt, n.updatedAt]);
    return n;
  }
  async updateNotice(id, p) {
    const r = await this.pool.query('UPDATE notices SET title=$2, body=$3, important=$4, updated_at=$5 WHERE id=$1 RETURNING *',
      [id, p.title, p.body, !!p.important, p.updatedAt]);
    return this.notice(r.rows[0]);
  }
  async removeNotice(id) { return (await this.pool.query('DELETE FROM notices WHERE id=$1', [id])).rowCount > 0; }
  async addFeedback(f) {
    await this.pool.query('INSERT INTO feedback (id, user_id, username, nickname, category, game, text, created_at, done) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false)',
      [f.id, f.userId || null, f.username || null, f.nickname || null, f.category, f.game || null, f.text, f.createdAt]);
    return f;
  }
  async listFeedback(n = 100) { return (await this.pool.query('SELECT * FROM feedback ORDER BY created_at DESC LIMIT $1', [n])).rows.map((r) => this.fb(r)); }
  async setFeedbackDone(id, done) { return this.fb((await this.pool.query('UPDATE feedback SET done=$2 WHERE id=$1 RETURNING *', [id, !!done])).rows[0]); }
  async removeFeedback(id) { await this.pool.query('DELETE FROM feedback WHERE id=$1', [id]); return true; }
  async openFeedbackCount() { return (await this.pool.query('SELECT COUNT(*)::int AS n FROM feedback WHERE done=false')).rows[0].n; }
  async addLog(e) {
    await this.pool.query('INSERT INTO admin_log (at, actor, action, target, detail) VALUES ($1,$2,$3,$4,$5)', [e.at, e.actor, e.action, e.target || null, e.detail || null]);
    return e;
  }
  async listLog(n = 100) {
    return (await this.pool.query('SELECT * FROM admin_log ORDER BY id DESC LIMIT $1', [n])).rows
      .map((r) => ({ id: Number(r.id), at: Number(r.at), actor: r.actor, action: r.action, target: r.target, detail: r.detail }));
  }
  async getKv(k) { const r = (await this.pool.query('SELECT v FROM site_kv WHERE k=$1', [k])).rows[0]; return r ? r.v : null; }
  async setKv(k, v) { await this.pool.query('INSERT INTO site_kv (k, v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v', [k, JSON.stringify(v)]); }

  // ── 계정 표 ──
  async saveMeta(id, meta) { await this.pool.query('UPDATE users SET meta=$2 WHERE id=$1', [id, meta]); }
  async setNickname(id, nickname) { await this.pool.query('UPDATE users SET nickname=$2 WHERE id=$1', [id, nickname]); }
  async setPass(id, pass) { await this.pool.query('UPDATE users SET pass=$2 WHERE id=$1', [id, pass]); }
  async removeUser(id) { return (await this.pool.query('DELETE FROM users WHERE id=$1', [id])).rowCount > 0; }
  async nicknameTaken(nickname, exceptId) {
    const r = await this.pool.query('SELECT 1 FROM users WHERE lower(nickname)=lower($1) AND id<>$2 LIMIT 1', [nickname, exceptId || '']);
    return r.rows.length > 0;
  }
  async searchUsers(q, n = 20) {
    const s = String(q || '').trim();
    const r = s
      ? await this.pool.query("SELECT * FROM users WHERE username ILIKE $1 OR nickname ILIKE $1 ORDER BY created_at DESC LIMIT $2", [`%${likeEscape(s)}%`, n])
      : await this.pool.query('SELECT * FROM users ORDER BY created_at DESC LIMIT $1', [n]);
    return r.rows.map((x) => this.users.row(x));
  }
  async userCount() { return (await this.pool.query('SELECT COUNT(*)::int AS n FROM users')).rows[0].n; }
  async byNickname(nickname) {
    return this.users.row((await this.pool.query('SELECT * FROM users WHERE lower(nickname)=lower($1) LIMIT 1', [nickname])).rows[0]);
  }
}

function createSiteStore(userStore, file) {
  return userStore.pool ? new PgSiteStore(userStore) : new FileSiteStore(file, userStore);
}

module.exports = { createSiteStore, FileSiteStore, PgSiteStore, likeEscape };
