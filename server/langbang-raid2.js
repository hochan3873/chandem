'use strict';
// 랑방 대전 — 건물주 레이드 서버 길 (/api/langbang/raid2*)
//  규칙(체력 · 페이즈 · 입장 · 보상 · 세트)은 화면과 같은 파일(public/langbang/raid2.js)
//  서버가 믿는 것: 판 번호(시작할 때 서버가 줌) · 걸린 시간 · 피해 상한(성장 정도) — 실제로 깎이는 양 · 넘긴 페이즈 · 보상은 서버가 계산
//  난이도: 시작할 때 서버가 열렸는지 확인하고 판 기록(run.df)에 적는다 → 끝낼 때는 그 기록만 쓴다 (끝낼 때 보낸 난이도는 무시)
//  예전(팔 8개) 상태가 저장돼 있으면 처음 불러올 때 체력 하나로 옮겨 저장한다 (R2.migrateState)
//  서버 전체 보스 상태는 표 하나(lb_raid2, 파일 저장소면 data.raid2)에 — 전적 기록과 같은 줄(serial)에서 차례로 고친다 (동시에 끝나도 두 번 세지 않게)
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

let R2 = null;
const r2Ready = import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'raid2.js')).href)
  .then((m) => { R2 = m; }).catch((e) => console.error('[langbang] raid2.js 불러오기 실패:', e.message));

function createRaid2(d) {
  const { store, update, serial, userFromToken, verifyToken, lbView, normLb, isMasterName, freeMaster, masterList, AuthError } = d;
  const L = () => d.LIVE();
  const DAY = 86400e3;

  // ── 서버 전체 보스 상태 (메모리 + 저장) ──
  let S = null, tableOk = false;
  async function loadState() {
    if (store.pool) {
      if (!tableOk) { await store.pool.query('CREATE TABLE IF NOT EXISTS lb_raid2 (id TEXT PRIMARY KEY, data JSONB NOT NULL)'); tableOk = true; }
      const r = await store.pool.query("SELECT data FROM lb_raid2 WHERE id='cur'");
      return r.rows[0] ? r.rows[0].data : null;
    }
    return (store.data && store.data.raid2) || null;
  }
  async function saveState() {
    if (store.pool) await store.pool.query("INSERT INTO lb_raid2 (id, data) VALUES ('cur', $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data", [S]);
    else if (store.data) { store.data.raid2 = S; store.save(); }
  }
  // 활동 인원: 최근 14일 안에 판을 한 (마스터 빼고) 계정
  async function activeCount(now) {
    const since = now - R2.R2.activeDays * DAY;
    if (store.pool) {
      const r = await store.pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE GREATEST(COALESCE((stats->'langbang'->>'lastResultAt')::bigint, 0), COALESCE((stats->'langbang'->>'lastSeenAt')::bigint, 0)) > $1 AND NOT (username = ANY($2::text[]))`, [since, [...masterList()]]);
      return r.rows[0].n;
    }
    return Object.values(store.data.users).filter((u) => !isMasterName(u.username) && Math.max(Number(((u.stats || {}).langbang || {}).lastResultAt) || 0, Number(((u.stats || {}).langbang || {}).lastSeenAt) || 0) > since).length;
  }
  // (serial 안에서) 이번 주로 맞추기
  async function ensure(now = Date.now()) {
    await r2Ready;
    if (!S) { const raw = await loadState(); S = R2.migrateState(raw); if (S && S !== raw) await saveState(); }
    const wi = L().weekIndex(now);
    if (!S || !Number.isInteger(S.wi) || S.wi < wi) {
      const r = R2.rollWeek(S, now, await activeCount(now));
      S = r.s;
      await saveState();
    }
    return S;
  }
  const inSerial = (fn) => { let out, err; return serial(async () => { try { out = await fn(); } catch (e) { err = e; } }).then(() => { if (err) throw err; return out; }); };
  const lbOfU = (u) => normLb(JSON.parse(JSON.stringify((u.stats && u.stats.langbang) || {})), isMasterName(u.username));
  const saveLb = (id, fn) => update(id, (st) => { const lb = st.langbang = normLb(st.langbang); fn(lb); delete lb.master; });

  // ── 보상 정산 (우편) — 끝난 주(보관 기록) 전부 + 이번 주에 잡았으면 참가 · 토벌 ──
  function settle(lb, uid, now) {
    const r = R2.r2Week(lb, now);
    const sent = [];
    const srcs = [...(S.hist || []).map((a) => ({ a, ended: true })), ...(R2.killed(S) ? [{ a: R2.archiveOf(S), ended: false }] : [])];
    for (const { a, ended } of srcs) {
      const pd = r.paid.find((x) => x.wi === a.wi) || null;
      const f = pd ? pd.f : 0;
      const list = R2.pendingRewards(a, uid, f, ended);
      if (!list.length) continue;
      let nf = f;
      for (const it of list) {
        let txt = it.text;
        for (let k = 0; k < it.set; k++) { const g = R2.setGive(lb, `r2set:${uid}:${a.wi}:${it.bit}:${k}`); txt += g.id ? ` · 건물주 세트 「${R2.SET[g.id].name}」${g.new ? ' 획득' : ` Lv${g.lv}`}` : ' · 세트 다 모음 → 3,000코인'; }
        L().mailAdd(lb, { title: it.title, text: txt.slice(0, 80), rw: it.rw, days: 14 }, now);
        nf |= it.bit; sent.push(it.title);
      }
      r.paid = [...r.paid.filter((x) => x.wi !== a.wi), { wi: a.wi, f: nf }].slice(-12);
    }
    return sent;
  }
  // 옛 모임 레이드에서 못 받은 보상 → 우편 (한 번)
  async function oldRaidCtx(u, id) {
    const lb = (u.stats && u.stats.langbang) || {};
    const rd = lb.raid;
    if (!rd || !(rd.dmg > 0) || rd.claimed || !Number.isInteger(rd.wi) || !store.raidTotal) return null;
    const total = await store.raidTotal(rd.wi);
    return { wi: rd.wi, total, rank: await store.raidRank(rd.wi, id), killed: total >= L().RAID.hp };
  }
  function oldRaidMail(lb, ctx, now) {
    if (!ctx || !lb.raid || lb.raid.claimed) return false;
    const rw = L().raidReward(lb.raid.dmg, ctx.total, ctx.rank, ctx.killed);
    lb.raid.claimed = true;
    if (!rw) return false;
    const { label, ...rest } = rw;
    L().mailAdd(lb, { title: '지난 모임 레이드 보상', text: `${label || ''} · 모임 레이드는 건물주 레이드로 바뀌었어요`.slice(0, 80), rw: rest, days: 14 }, now);
    return true;
  }

  // ── 화면 ──
  const partNames = () => Object.fromEntries(Object.entries(S.by || {}).map(([p, b]) => [p, b.n || '']));
  function pub(now) {
    const s = S;
    return {
      wi: s.wi, tier: s.tier, hpMax: s.hpMax, hp: { ...s.hp }, max: { ...s.max }, left: R2.hpLeft(s), by: partNames(), phase: R2.phaseOf(s), exposed: R2.exposed(s),
      killed: R2.killed(s), killedAt: s.killedAt || 0, killer: s.killer ? s.killer.n : '', endsAt: R2.weekEndMs(s.wi), active: s.active, runCap: Math.round(s.hpMax * R2.R2.runCapPct),
      day: R2.dayOf(now), feed: (s.feed || []).slice(0, 15), hitting: R2.nowHitting(s, now), players: R2.participants(s),
      prev: s.hist && s.hist[0] ? { wi: s.hist[0].wi, tier: s.hist[0].tier, killed: s.hist[0].killed, killer: s.hist[0].killer ? s.hist[0].killer.n : '', top: s.hist[0].rank.slice(0, 3).map((x) => x[3]) } : null,
    };
  }
  async function board(token, lite) {
    const now = Date.now();
    const id = token ? verifyToken(token) : null;
    const out = await inSerial(async () => {
      await ensure(now);
      const base = pub(now);
      if (lite) return base;
      base.top = R2.topList(S, 20).map((x) => ({ rank: x.rank, nickname: x.nickname, dmg: x.dmg, coop: x.coop, runs: x.runs, score: x.score, df: x.df, me: x.uid === id }));
      if (!id) return base;
      const u = await store.byId(id);
      if (!u) return base;
      const oc = await oldRaidCtx(u, id);
      let me = null, mailed = [], profile = null;
      const lb0 = lbOfU(u);
      // 보낼 우편이 있을 때만 저장
      const test = lbOfU(u);
      const would = settle(test, id, now).length > 0 || (oc && !test.raid.claimed);
      if (would) {
        const st = await saveLb(id, (lb) => { mailed = settle(lb, id, now); if (oldRaidMail(lb, oc, now)) mailed.push('지난 모임 레이드 보상'); });
        profile = lbView(st.langbang, id, isMasterName(u.username));
      }
      const lb = profile || lb0;
      const r = R2.r2Week(lb, now);
      const b = (S.board || {})[id] || null;
      const fr = (lb.fr && lb.fr.list) || [];
      const names = await nicks([...r.rin.map((x) => x.id), ...fr.map((x) => x.id)]);
      me = {
        left: R2.entriesLeft(lb, now), used: r.used, bonus: r.bonus, unlocked: R2.r2Unlocked(lb) || isMasterName(u.username),
        dmg: b ? b.d : 0, coop: b ? b.c : 0, runs: b ? b.r : 0, lastHits: b ? b.lh : 0, rank: R2.rankOf(S, id), best: r.best, total: r.total,
        rin: r.rin.slice().reverse().map((x) => ({ id: x.id, n: names.get(x.id) || x.n, at: x.at })),
        friends: fr.map((x) => ({ id: x.id, n: names.get(x.id) || '', sent: R2.rallySentToday(lb, x.id, now) })).filter((x) => x.n),
        rallyLeft: Math.max(0, R2.R2.rallyPerDay - ((r.rout && r.rout.day === L().dayIndex(now)) ? r.rout.ids.length : 0)),
        master: isMasterName(u.username),
        diffs: Object.fromEntries(R2.DIFF_IDS.map((k) => [k, R2.diffOpen(lb, k, isMasterName(u.username)).ok])), hardSec: r.hardSec | 0,
      };
      return { ...base, me, mailed, profile };
    });
    return out;
  }
  async function nicks(ids) {
    const want = [...new Set(ids)].filter((x) => typeof x === 'string').slice(0, 80);
    const m = new Map();
    if (!want.length) return m;
    if (store.pool) { const r = await store.pool.query('SELECT id, nickname FROM users WHERE id = ANY($1::text[])', [want]); for (const x of r.rows) m.set(x.id, x.nickname); }
    else for (const id of want) { const u = store.data.users[id]; if (u) m.set(id, u.nickname); }
    return m;
  }

  // ── 시작: 입장 하나 · 부르기 응답(+1 입장 · 버프) · 친구 멤버 빌리기 ──
  async function start(token, body) {
    const id = await userFromToken(token);
    const now = Date.now();
    const rally = typeof body.rally === 'string' ? body.rally.slice(0, 40) : null;
    const diff = body.diff === undefined || body.diff === null ? 'normal' : String(body.diff).slice(0, 12);
    const fid = typeof body.friend === 'string' && body.friend !== id ? body.friend.slice(0, 40) : null;
    const rid = crypto.randomBytes(9).toString('base64url');
    let lend = null;
    const out = await inSerial(async () => {
      await ensure(now);
      const u = await store.byId(id);
      if (!u) return { error: '다시 로그인해 주세요' };
      const ms = isMasterName(u.username);
      const f = fid ? await store.byId(fid) : null;
      const fl = f ? lbOfU(f) : null;
      const run = (lb) => {
        if (fid) {
          if (!f) return { error: '없는 친구예요' };
          if (!L().isFriend(fl, id)) return { error: '서로 친구일 때만 빌릴 수 있어요' };
          const e = L().borrowCheck(lb, fid, now);
          if (e) return { error: e };
        }
        const r = R2.r2Start(lb, S, rid, now, { rally, free: freeMaster(u), help: !!fid, diff, master: ms, day: ms && typeof body.day === 'string' ? body.day : undefined }); // 요일 건물주: 서버 시계 (마스터만 골라 시험)
        if (r.error) return r;
        if (fid) { const help = { nick: f.nickname, ...L().friendSnapshot(fl) }; L().borrowMark(lb, fid, help, rid, now); r.help = help; }
        return r;
      };
      const test = lbOfU(u);
      if (!R2.r2Unlocked(test) && !ms) return { error: '건물주 레이드는 1-5를 깨면 참가할 수 있어요' };
      const r0 = run(test);
      if (r0.error) return r0;
      let r1 = null;
      const st = await saveLb(id, (lb) => { r1 = run(lb); });
      S.live = S.live || {}; S.live[id] = now;
      for (const [k, t] of Object.entries(S.live)) if (now - t > R2.R2.liveSec * 1000) delete S.live[k];
      await saveState();
      if (fid) lend = { nick: u.nickname };
      return { profile: lbView(st.langbang, id, ms), ...r1, master: ms };
    });
    if (out.error) throw new AuthError(out.error);
    if (lend) await inSerial(() => saveLb(fid, (lb) => L().lendReward(lb, lend.nick, now)));
    return out;
  }

  // ── 끝: 판 번호 · 시간 · 상한 확인 → 서버 체력 깎기 · 막타 보상 · 부른 친구 협동 ──
  async function finish(token, body) {
    const id = await userFromToken(token);
    const now = Date.now();
    const dur = Math.max(0, Math.min(1e6, Math.floor(Number(body.durationSec) || 0)));
    const parts = R2.normParts(body.parts); // 옛 팔 이름이 와도 몸통 피해로 합친다
    const total = parts.body || 0;
    const kills = Math.max(0, Math.min(1e5, Math.floor(Number(body.kills) || 0)));
    let bk = null;
    const out = await inSerial(async () => {
      await ensure(now);
      const u = await store.byId(id);
      if (!u) return { error: '다시 로그인해 주세요' };
      const ms = isMasterName(u.username);
      const before = lbOfU(u);
      const run = before.raid2 && before.raid2.run;
      if (!run || run.id !== String(body.runId || '')) return { error: '건물주 레이드를 다시 시작해 주세요' };
      if (now - run.at > 15 * 60e3) return { error: '너무 오래된 판이에요' };
      if (dur > (now - run.at) / 1000 * 1.15 + 20 || dur > R2.R2.sec + 30) return { error: '기록을 확인할 수 없어요' };
      const help = !!L().helpFor(before, run.id);
      const diff = R2.diffOf(run.df); // 시작할 때 서버가 확인해 적어 둔 난이도만 (body.diff 는 안 믿음)
      const dRw = R2.DIFF[diff].rw;
      if (total > R2.r2Cap(before, dur, { help, rally: !!run.rally })) return { error: '기록을 확인할 수 없어요' };
      // 서버 체력 (마스터 테스트 판은 안 깎는다)
      const res = ms ? { counted: 0, raw: total, mul: R2.diffMul(diff), diff, cap: R2.runCapOf(S, diff), broke: [], killed: false, test: true } : R2.applyRun(S, id, u.nickname, parts, now, { coop: !!run.rally, diff });
      if (!ms && run.rally && res.counted > 0) R2.coopCredit(S, run.rally, run.rn, res.counted * R2.R2.coopPct);
      if (ms && S.live) delete S.live[id];
      await saveState();
      const skills = L().skillCap(body.skills, dur);
      let mailN = 0, hellNew = false;
      const st = await saveLb(id, (lb) => {
        const r = R2.r2Week(lb, now);
        r.run = null;
        if (lb.fr) lb.fr.help = null;
        r.best = Math.max(r.best | 0, res.counted); r.total = (r.total | 0) + res.counted;
        if (diff === 'hard' && dur > (r.hardSec | 0)) { const was = R2.diffOpen(lb, 'hell').ok; r.hardSec = Math.min(R2.R2.sec + 30, dur); hellNew = !was && R2.diffOpen(lb, 'hell').ok; }
        lb.coins += dRw.coins; lb.stones = (lb.stones | 0) + dRw.stones; lb.exp += 40; lb.runs++; lb.kills += kills;
        while (lb.exp >= 100 + (lb.level - 1) * 60) { lb.exp -= 100 + (lb.level - 1) * 60; lb.level++; L().staminaAdd(lb, L().STAMINA.lvUp, now); }
        if (Array.isArray(body.seen) && d.ENEMY_IDS) lb.seen = [...new Set([...lb.seen, ...body.seen.slice(0, 40).map(String).filter((t) => d.ENEMY_IDS.includes(t))])];
        lb.lastResultAt = now;
        L().trackRun(lb, { mode: 'raid', kills, bosses: 0, skills }, id, now);
        // 막타 보상: 페이즈 넘기기 (2 · 3페이즈) · 마지막 일격
        for (const p of res.broke) {
          const rw = p === 'body' ? R2.KILL_RW : R2.PART_RW;
          L().mailAdd(lb, { title: p === 'body' ? '건물주 대마왕 막타!' : `건물주 ${R2.partName(p)} 막타!`, text: p === 'body' ? `${S.tier}단계 건물주 대마왕을 내 손으로 쓰러뜨렸어요` : `${S.tier}단계 건물주를 ${p === 'p3' ? '3페이즈(분노)' : '2페이즈(짜증)'}로 몰아넣었어요`, rw, days: 14 }, now);
          mailN++;
        }
      });
      // 부른 친구: 협동 우편 (응답해 줬다는 알림 · 협동 기여)
      if (!ms && run.rally && res.counted > 0) {
        const v = Math.round(res.counted * R2.R2.coopPct);
        await saveLb(run.rally, (lb) => { L().mailAdd(lb, { title: '부름에 응답했어요!', text: `${u.nickname}님이 같이 때렸어요 · 협동 기여 +${v.toLocaleString('ko-KR')}`, from: u.nickname, rw: { coins: 300 }, days: 7 }, now); });
      }
      const usedOk = Array.isArray(body.heroesUsed) ? [...new Set(body.heroesUsed.map(String))].filter((h) => L().heroUnlocked(before, h)).slice(0, 7) : [];
      bk = usedOk;
      const b = (S.board || {})[id] || {};
      return {
        profile: lbView(st.langbang, id, ms), raid2: { dmg: total, diff, mul: R2.diffMul(diff), rw: dRw, hellNew, counted: res.counted, cap: res.cap, clipped: !!res.clipped, broke: res.broke, killed: res.killed, test: !!res.test, coop: run.rally ? Math.round(res.counted * R2.R2.coopPct) : 0, rally: run.rally ? run.rn : '', help: help ? { nick: L().helpFor(before, run.id).nick, hero: L().helpFor(before, run.id).hero } : null },
        mine: { dmg: b.d | 0, coop: b.c | 0, rank: R2.rankOf(S, id) }, state: pub(now), mailN,
      };
    });
    if (out.error) throw new AuthError(out.error);
    if (bk && bk.length && d.onRun) out.bonkae = await d.onRun(id, bk, 'raid', { wave: 0 });
    return out;
  }

  // ── 친구 부르기: "같이 때려줘" (두 사람 기록을 함께) ──
  async function rally(token, fid) {
    const id = await userFromToken(token);
    fid = typeof fid === 'string' ? fid.slice(0, 40) : '';
    if (!fid || fid === id) throw new AuthError('친구를 골라 주세요');
    const now = Date.now();
    const out = await inSerial(async () => {
      await ensure(now);
      if (R2.killed(S)) return { error: '이번 주 건물주는 이미 쓰러졌어요' };
      const [u, f] = [await store.byId(id), await store.byId(fid)];
      if (!u || !f) return { error: '없는 친구예요' };
      const a = lbOfU(u), b = lbOfU(f);
      const r = R2.rallySend(a, b, id, fid, u.nickname, now);
      if (r.error) return r;
      await saveLb(fid, (lb) => { R2.rallySend(lbOfU(u), lb, id, fid, u.nickname, now); });
      const st = await saveLb(id, (lb) => { R2.rallySend(lb, lbOfU(f), id, fid, u.nickname, now); });
      return { sent: true, nickname: f.nickname, profile: lbView(st.langbang, id, isMasterName(u.username)) };
    });
    if (out.error) throw new AuthError(out.error);
    return out;
  }
  // 세트 끼우기
  const setEquip = (token, sid, hero) => d.lbLive(token, (lb) => R2.setEquip(lb, sid, hero));

  function mount(r, wrap, tok) {
    const b = (req) => req.body || {};
    r.get('/raid2', wrap((req) => board(tok(req) || null, req.query.lite === '1')));
    r.post('/raid2/start', wrap((req) => start(tok(req), b(req))));
    r.post('/raid2/finish', wrap((req) => finish(tok(req), b(req))));
    r.post('/raid2/rally', wrap((req) => rally(tok(req), b(req).id)));
    r.post('/raid2/set', wrap((req) => setEquip(tok(req), String(b(req).id || ''), b(req).hero ? String(b(req).hero) : null)));
  }
  // 테스트용: 서버 상태 직접 보기 · 바꾸기
  const _state = () => S;
  const _setState = async (s) => { await r2Ready; S = R2.migrateState(s); await inSerial(() => saveState()); };
  const _reload = async () => { S = null; };
  // 우편함 맞추기(/mail/sync · 이미 serial 안)에서: 레이드 화면을 안 열어도 보상 우편이 오게
  async function mailPrep(u, id, now) { await ensure(now); return { r2old: await oldRaidCtx(u, id) }; }
  function mailSettle(lb, id, now, ctx) { if (!S) return 0; const n = settle(lb, id, now).length; return n + (oldRaidMail(lb, ctx && ctx.r2old, now) ? 1 : 0); }
  return { mount, board, start, finish, rally, mailPrep, mailSettle, ensure: () => inSerial(() => ensure()), _state, _setState, _reload };
}

module.exports = { createRaid2, r2Ready, getR2: () => R2 };
