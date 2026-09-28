'use strict';
const crypto = require('crypto');
const { Hand, IllegalAction } = require('./engine/hand');
const bot = require('./bot');
const { SeotdaHand } = require('./games/seotda');
const { OmokGame, omokAI } = require('./games/omok');

class RoomError extends Error {}

const DEFAULT_SETTINGS = {
  startChips: 1000,
  sb: 10,
  bb: 20,
  minPlayers: 2,
  maxPlayers: 9,
  turnSeconds: 20,
  rebuyEnabled: true,
  rebuyAmount: 1000,
  rebuyMax: 3,
  password: '',
  approval: false,
  game: 'holdem',        // holdem | seotda | omok
  aiLevel: 'normal',     // 오목 AI: easy | normal | hard
  mode: 'cash',          // cash | tournament
  levelMinutes: 5,       // 토너먼트 블라인드가 오르는 간격(분)
};

const HOST_GRACE_MS = 30 * 1000;      // 방장 연결이 이만큼 끊기면 권한 이전
const AWAY_SKIP_MS = 60 * 1000;       // 이만큼 끊긴 사람은 다음 판에서 제외(자리 비움)
const RESULT_DELAY = { fold: 4500, showdown: 8000 };   // 결과를 보여준 뒤 다음 판까지
// 쇼다운 연출(ms). 올인 승부는 패 공개 → 남은 카드를 한 장씩 → 리버는 뜸을 들여 '쪼기'
const REVEAL = { first: 700, perHand: 1100, allinHands: 1600, flop: 1800, turn: 2200, squeeze: 1900, river: 1300, result: 900 };
const MAX_TIMEOUTS = 2;               // 연속 시간 초과 시 자리 비움 처리
const AVATAR_COUNT = 8;               // public/img/avatars/a1~a8
const BOT_THINK = [900, 2200];        // 봇이 생각하는 시간(ms) 범위
const EMOTES = ['angry', 'happy', 'mock', 'laugh', 'cry', 'clap'];
const EMOTE_GAP_MS = 1500;

function int(v, def) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : def;
}

function sanitizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const s = { ...base };
  const src = input || {};
  s.startChips = Math.min(10000000, Math.max(100, int(src.startChips, base.startChips)));
  s.sb = Math.max(1, int(src.sb, base.sb));
  s.bb = Math.max(s.sb, int(src.bb, base.bb));
  if (s.bb > s.startChips) throw new RoomError('빅 블라인드는 시작 칩보다 클 수 없어요');
  if (s.sb > s.bb) throw new RoomError('스몰 블라인드는 빅 블라인드보다 클 수 없어요');
  s.maxPlayers = Math.min(9, Math.max(2, int(src.maxPlayers, base.maxPlayers)));
  s.minPlayers = Math.min(s.maxPlayers, Math.max(2, int(src.minPlayers, base.minPlayers)));
  s.turnSeconds = Math.min(120, Math.max(10, int(src.turnSeconds, base.turnSeconds)));
  s.rebuyEnabled = src.rebuyEnabled === undefined ? base.rebuyEnabled : !!src.rebuyEnabled;
  s.rebuyAmount = Math.min(10000000, Math.max(1, int(src.rebuyAmount, s.startChips)));
  s.rebuyMax = Math.min(99, Math.max(1, int(src.rebuyMax, base.rebuyMax)));
  s.password = typeof src.password === 'string' ? src.password.trim().slice(0, 20) : base.password;
  s.approval = src.approval === undefined ? base.approval : !!src.approval;
  s.game = ['holdem', 'seotda', 'omok'].includes(src.game) ? src.game : (base.game || 'holdem');
  s.mode = src.mode === undefined ? (base.mode || 'cash') : src.mode === 'tournament' ? 'tournament' : 'cash';
  s.levelMinutes = Math.min(60, Math.max(1, int(src.levelMinutes, base.levelMinutes || 5)));
  if (s.mode === 'tournament') s.rebuyEnabled = false;   // 토너먼트는 칩을 다 잃으면 탈락
  s.aiLevel = ['easy', 'normal', 'hard'].includes(src.aiLevel) ? src.aiLevel : (base.aiLevel || 'normal');
  if (s.game === 'omok') {
    // 오목: 두 사람만 두고 나머지는 관전, 칩·토너먼트 없음
    s.maxPlayers = 2; s.minPlayers = 2; s.mode = 'cash'; s.rebuyEnabled = false;
    s.turnSeconds = Math.max(30, s.turnSeconds); // 오목은 한 수에 최소 30초
  }
  return s;
}

function cleanName(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 10);
  if (!n) throw new RoomError('닉네임을 입력해 주세요');
  return n;
}

// 토너먼트 블라인드: 레벨마다 빅 블라인드 배수
const LEVEL_MULT = [1, 1.5, 2, 3, 4, 6, 8, 10, 15, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400];
function niceRound(v) {
  const step = v < 100 ? 5 : v < 1000 ? 10 : v < 10000 ? 100 : 1000;
  return Math.max(1, Math.round(v / step) * step);
}
function levelBlinds(settings, level) {
  const m = LEVEL_MULT[Math.min(level, LEVEL_MULT.length - 1)];
  if (level === 0) return { sb: settings.sb, bb: settings.bb };
  const bb = niceRound(settings.bb * m);
  const half = bb * settings.sb / settings.bb;
  const step = half < 100 ? 5 : half < 1000 ? 10 : half < 10000 ? 100 : 1000;
  return { sb: Math.max(1, Math.floor(half / step) * step || Math.floor(half)), bb };
}

// 프로필 사진: 휴대폰에서 줄인 작은 이미지(data URL)만 받는다
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const PHOTO_MAX = 60000;
function cleanPhoto(photo) {
  if (typeof photo !== 'string' || photo.length > PHOTO_MAX || !PHOTO_RE.test(photo)) return null;
  return photo;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode() {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return c;
}
const newId = () => crypto.randomBytes(6).toString('hex');
const newToken = () => crypto.randomBytes(18).toString('base64url');

class Room {
  constructor({ code, settings, now = Date.now, pace = 1 }) {
    this.code = code;
    this.pace = pace;           // 테스트에서 연출 시간을 줄이는 배율
    this.reveal = null;         // 쇼다운 연출 진행 상태
    this.settings = settings;
    this.now = now;
    this.players = [];          // 참가자·관전자
    this.pending = [];          // 승인 대기
    this.hostId = null;
    this.phase = 'lobby';       // lobby | playing
    this.handNo = 0;
    this.dealerSeat = null;
    this.hand = null;
    this.handPlayers = [];      // 현재 판에 들어간 사람 id
    this.turnDeadline = null;
    this.nextHandAt = null;
    this.logSeq = 0;
    this.feed = [];             // 화면용 진행 기록(최근 것만)
    this.notice = null;         // 방 전체 안내 { text, at }
    this.createdAt = now();
    this.touchedAt = now();
    this.timers = {};
    this.onChange = () => {};
    this.onEmote = () => {};
    this.onRecord = () => {};   // 판이 끝나면 전적 기록 (index.js 에서 연결)
    this.emoteAt = {};
    this.stats = {};            // 봇이 읽는 상대 성향(레이즈·올인 빈도)
  }

  // ── 조회 ────────────────────────────────────────────
  get(id) { return this.players.find((p) => p.id === id); }
  byToken(token) { return this.players.find((p) => p.token === token) || this.pending.find((p) => p.token === token); }
  get seated() { return this.players.filter((p) => p.role === 'player').sort((a, b) => a.seat - b.seat); }
  get host() { return this.get(this.hostId); }
  name(id) { const p = this.get(id); return p ? p.name : '(나간 사람)'; }

  uniqueName(raw) {
    const base = cleanName(raw);
    const taken = new Set([...this.players, ...this.pending].map((p) => p.name));
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) {
      const cand = `${base} (${i})`;
      if (!taken.has(cand)) return cand;
    }
  }

  freeSeat() {
    const used = new Set(this.seated.map((p) => p.seat));
    for (let s = 0; s < this.settings.maxPlayers; s++) if (!used.has(s)) return s;
    return null;
  }

  // ── 입장 ────────────────────────────────────────────
  pickAvatar(want) {
    const n = Math.floor(Number(want));
    if (n >= 1 && n <= AVATAR_COUNT) return n;
    const used = new Map();
    for (const p of [...this.players, ...this.pending]) used.set(p.avatar, (used.get(p.avatar) || 0) + 1);
    let best = 1;
    for (let a = 1; a <= AVATAR_COUNT; a++) if ((used.get(a) || 0) < (used.get(best) || 0)) best = a;
    return best;
  }

  createPlayer(name, wantSpectator, avatar) {
    const p = {
      id: newId(),
      token: newToken(),
      name,
      avatar: this.pickAvatar(avatar),
      role: 'spectator',
      seat: null,
      stack: 0,
      ready: false,
      connected: false,
      disconnectedAt: null,
      joinedAt: this.now(),
      rebuys: 0,
      pendingRebuy: 0,
      sittingOut: false,
      timeouts: 0,
      leaving: false,
      totalBuyIn: 0,
    };
    if (!wantSpectator) this.takeSeat(p);
    return p;
  }

  takeSeat(p) {
    if (this.phase === 'playing' && this.isTournament) return false; // 토너먼트 도중엔 관전만
    const seat = this.freeSeat();
    if (seat === null) return false;
    p.role = 'player';
    p.seat = seat;
    p.ready = false;
    if (this.phase === 'playing' && p.totalBuyIn === 0) {
      p.stack = this.settings.startChips;
      p.totalBuyIn = this.settings.startChips;
    }
    return true;
  }

  setPhoto(p, photo) {
    const ok = cleanPhoto(photo);
    if (!ok) return;
    p.photo = ok;
    p.photoV = (p.photoV || 0) + 1;
  }

  /** 연습용 봇을 자리에 앉힌다 */
  addBot(hostId) {
    this.requireHost(hostId);
    const used = new Set(this.players.map((p) => p.name));
    const def = bot.BOTS.find((b) => !used.has(b.name)) || bot.BOTS[crypto.randomInt(bot.BOTS.length)];
    const p = this.createPlayer(this.uniqueName(def.name), false, def.avatar);
    if (p.role !== 'player') throw new RoomError('빈자리가 없어요');
    p.isBot = true;
    p.style = def.style;
    p.connected = true;
    p.ready = true;
    this.players.push(p);
    this.pushFeed(`${p.name}님이 자리에 앉았어요 🤖`);
    this.maybeStartWaitingHand();
    this.touch();
    return p;
  }

  botTurn() {
    const h = this.hand;
    if (!h || h.finished) return;
    const p = this.get(h.currentId);
    if (!p || !p.isBot) return;
    let action;
    try {
      if (h.kind === 'omok') {
        const mv = omokAI.bestMove(h.cells, h.seatOf(p.id).color, this.settings.aiLevel);
        action = { type: 'place', x: mv.x, y: mv.y };
      } else if (h.kind === 'seotda') action = bot.decideSeotda(h, p.id, bot.STYLES[p.style || 0], this.stats, this.settings.aiLevel);
      else action = bot.decide(h, p.id, bot.STYLES[p.style || 0], this.stats);
    } catch (e) { console.error('[bot]', e); }
    try { this.act(p.id, action || { type: 'fold' }); }
    catch { this.act(p.id, { type: h.legalActions(p.id).canCheck ? 'check' : 'fold' }); }
  }

  /** 감정 표현(이모티콘 + 소리). 너무 자주 못 보내게 막는다 */
  emote(id, kind) {
    const p = this.get(id);
    if (!p || p.leaving) throw new RoomError('참가자를 찾을 수 없어요');
    if (!EMOTES.includes(kind)) throw new RoomError('알 수 없는 표현이에요');
    const t = this.now();
    if (t - (this.emoteAt[id] || 0) < EMOTE_GAP_MS) throw new RoomError('조금 있다가 다시 보내 주세요');
    this.emoteAt[id] = t;
    this.onEmote({ id, kind, name: p.name });
  }

  /** 판이 끝나면 봇이 가끔 감정 표현을 한다 */
  botEmotes(result) {
    if (result.type === 'omok') {
      for (const p of this.seated) {
        if (!p.isBot) continue;
        const kind = result.winners.includes(p.id) ? (Math.random() < 0.6 ? ['happy', 'mock', 'laugh'][crypto.randomInt(3)] : null) : (Math.random() < 0.5 ? ['angry', 'cry'][crypto.randomInt(2)] : null);
        if (kind) this.setTimer('emote:' + p.id, 1200 * this.pace, () => { try { this.emote(p.id, kind); } catch {} });
      }
      return;
    }
    const bb = this.settings.bb;
    for (const p of this.seated) {
      if (!p.isBot) continue;
      const d = (result.deltas || {})[p.id] || 0;
      let kind = null;
      if (d >= bb * 15 && Math.random() < 0.5) kind = ['happy', 'mock', 'laugh'][crypto.randomInt(3)];
      else if (d <= -bb * 15 && Math.random() < 0.4) kind = ['angry', 'cry'][crypto.randomInt(2)];
      if (kind) this.setTimer('emote:' + p.id, (1200 + crypto.randomInt(1500)) * this.pace, () => { try { this.emote(p.id, kind); } catch {} });
    }
  }

  /** 참가 요청. 반환: { player, pending } */
  join({ name, password, spectator, avatar, photo, user }) {
    if (this.settings.password && password !== this.settings.password) {
      throw new RoomError('비밀번호가 맞지 않아요');
    }
    const uname = this.uniqueName(name);
    const p = this.createPlayer(uname, true, avatar);
    this.setPhoto(p, photo);
    if (user) { p.userId = user.id; p.omokRating = user.stats.omok.rating; }
    p.wantSpectator = !!spectator;
    // 방장 승인 설정이 켜져 있거나, 이미 게임이 진행 중이면 방장이 받아 줘야 들어온다
    if ((this.settings.approval || this.phase === 'playing') && this.players.some((x) => !x.isBot)) {
      this.pending.push(p);
      this.touch();
      return { player: p, pending: true };
    }
    this.admit(p);
    return { player: p, pending: false };
  }

  admit(p) {
    this.players.push(p);
    if (!p.wantSpectator) this.takeSeat(p);
    delete p.wantSpectator;
    if (!this.hostId) this.hostId = p.id;
    this.pushFeed(`${p.name}님이 ${p.role === 'player' ? '참가' : '관전하러 입장'}했어요`);
    this.maybeStartWaitingHand();
    this.touch();
  }

  approve(hostId, targetId, ok) {
    this.requireHost(hostId);
    const idx = this.pending.findIndex((p) => p.id === targetId);
    if (idx === -1) throw new RoomError('이미 처리된 요청이에요');
    const [p] = this.pending.splice(idx, 1);
    if (ok) this.admit(p);
    else p.rejected = true;
    this.touch();
    return p;
  }

  requireHost(id) {
    if (id !== this.hostId) throw new RoomError('방장만 할 수 있어요');
  }

  // ── 대기실 ──────────────────────────────────────────
  setReady(id, ready) {
    const p = this.get(id);
    if (!p || p.role !== 'player') throw new RoomError('참가자만 준비할 수 있어요');
    p.ready = !!ready;
    this.touch();
  }

  setRole(id, spectator) {
    const p = this.get(id);
    if (!p) throw new RoomError('참가자를 찾을 수 없어요');
    if (spectator) {
      if (p.role === 'spectator') return;
      if (this.handPlayers.includes(p.id) && this.hand && !this.hand.finished) {
        throw new RoomError('진행 중인 판이 끝난 뒤에 관전으로 바꿀 수 있어요');
      }
      p.role = 'spectator';
      p.seat = null;
      if (!p.isBot) p.ready = false;
    } else {
      if (p.role === 'player') return;
      if (!this.takeSeat(p)) throw new RoomError('빈 자리가 없어요');
      this.maybeStartWaitingHand();
    }
    this.touch();
  }

  updateSettings(hostId, input) {
    this.requireHost(hostId);
    if (this.phase !== 'lobby') throw new RoomError('게임 중에는 설정을 바꿀 수 없어요');
    const next = sanitizeSettings(input, this.settings);
    if (this.seated.length > next.maxPlayers) throw new RoomError('이미 앉은 인원보다 최대 인원을 적게 할 수 없어요');
    this.settings = next;
    // 자리 번호가 최대 인원을 넘으면 앞자리로 당긴다
    this.seated.forEach((p, i) => { p.seat = i; });
    this.touch();
  }

  startCheck() {
    const seated = this.seated;
    if (seated.length < this.settings.minPlayers) return `참가자가 ${this.settings.minPlayers}명 이상 필요해요 (지금 ${seated.length}명)`;
    const notReady = seated.filter((p) => p.id !== this.hostId && !p.ready);
    if (notReady.length) return `아직 준비 안 한 사람: ${notReady.map((p) => p.name).join(', ')}`;
    return null;
  }

  start(hostId) {
    this.requireHost(hostId);
    if (this.phase !== 'lobby') throw new RoomError('이미 게임이 시작됐어요');
    const why = this.startCheck();
    if (why) throw new RoomError(why);
    this.phase = 'playing';
    for (const p of this.seated) {
      p.stack = this.settings.startChips;
      p.totalBuyIn = this.settings.startChips;
      p.rebuys = 0;
      p.pendingRebuy = 0;
      p.sittingOut = false;
      p.timeouts = 0;
    }
    if (this.isTournament) {
      this.tourney = { startedAt: this.now(), level: 0, busted: [], result: null, entrants: this.seated.length };
      this.pushFeed(`🏆 토너먼트 시작 · ${this.settings.levelMinutes}분마다 블라인드가 올라가요`);
    } else {
      this.tourney = null;
      this.pushFeed('게임을 시작합니다');
    }
    this.startHand();
  }

  endGame(hostId) {
    this.requireHost(hostId);
    if (this.hand && !this.hand.finished) throw new RoomError('진행 중인 판이 끝난 뒤에 끝낼 수 있어요');
    this.clearTimer('next');
    this.phase = 'lobby';
    this.hand = null;
    this.handPlayers = [];
    this.nextHandAt = null;
    for (const p of this.players) p.ready = !!p.isBot;
    this.pushFeed('방장이 게임을 끝내고 대기실로 돌아왔어요');
    this.touch();
  }

  // ── 판 진행 ─────────────────────────────────────────
  /** 자리 비움(스스로 비움, 시간 초과 반복, 오래 연결 끊김): 판에는 들어가되 자동으로 체크/다이 */
  isAway(p) {
    if (p.isBot) return false;
    if (p.sittingOut) return true;
    return !p.connected && !!p.disconnectedAt && this.now() - p.disconnectedAt > AWAY_SKIP_MS;
  }

  get isTournament() { return this.settings.mode === 'tournament'; }

  /** 지금 적용할 블라인드 */
  blinds() {
    return this.isTournament && this.tourney ? levelBlinds(this.settings, this.tourney.level) : { sb: this.settings.sb, bb: this.settings.bb };
  }

  eligibleForHand() {
    const t = this.now();
    return this.seated.filter((p) => {
      if (p.leaving) return false;
      if (p.stack + p.pendingRebuy <= 0) return false;
      void t;
      return true;
    });
  }

  startHand() {
    this.clearTimer('next');
    this.clearTimer('reveal');
    this.reveal = null;
    this.nextHandAt = null;
    // 판과 판 사이: 나간 사람 정리, 리바인 적용
    this.players = this.players.filter((p) => !p.leaving);
    for (const p of this.seated) {
      if (p.pendingRebuy > 0) {
        p.stack += p.pendingRebuy;
        p.totalBuyIn += p.pendingRebuy;
        this.pushFeed(`${p.name}님 리바인 적용: +${p.pendingRebuy.toLocaleString()}`);
        p.pendingRebuy = 0;
      }
    }
    for (const p of this.seated) {
      if (!this.isTournament && p.isBot && p.stack === 0) {
        p.stack = this.settings.startChips;
        p.totalBuyIn += this.settings.startChips;
        this.pushFeed(`${p.name} 칩 충전 +${p.stack.toLocaleString()}`);
      }
    }
    if (this.isTournament && this.tourney) {
      // 탈락자 기록(칩이 0이 된 순서대로), 한 명만 남으면 끝
      for (const p of this.seated) {
        if (p.stack === 0 && !this.tourney.busted.includes(p.id)) this.tourney.busted.push(p.id);
      }
      const alive = this.seated.filter((p) => p.stack > 0 && !p.leaving);
      if (alive.length <= 1) { this.finishTournament(alive[0]); return false; }
      const lvl = Math.floor((this.now() - this.tourney.startedAt) / (this.settings.levelMinutes * 60000));
      if (lvl > this.tourney.level) {
        this.tourney.level = Math.min(lvl, LEVEL_MULT.length - 1);
        const b = this.blinds();
        this.pushFeed(`⬆ 블라인드 상승! 레벨 ${this.tourney.level + 1} · ${b.sb.toLocaleString()}/${b.bb.toLocaleString()}`);
      }
    }
    let eligible = this.eligibleForHand();
    let carry = null;
    if (this.seotdaCarry && this.settings.game === 'seotda') {
      carry = this.seotdaCarry;
      this.seotdaCarry = null;
      const inCarry = this.seated.filter((p) => carry.ids.includes(p.id) && !p.leaving);
      if (inCarry.length >= 2) eligible = inCarry;
      else {
        // 재경기할 사람이 한 명만 남았으면 이월된 판돈은 그 사람 것
        if (inCarry[0]) { inCarry[0].stack += carry.amount; this.pushFeed(`${inCarry[0].name}님이 이월된 판돈 ${carry.amount.toLocaleString()}을 가져갔어요`); }
        carry = null;
      }
    }
    // 자리에 있는 사람이 아무도 없으면 봇끼리 계속 치지 않는다
    const hasHuman = eligible.some((p) => !p.isBot && !this.isAway(p));
    if (eligible.length < 2 || !hasHuman) {
      this.hand = null;
      this.handPlayers = [];
      this.waiting = true;
      this.touch();
      return false;
    }
    this.waiting = false;
    // 딜러 버튼: 이전 딜러 자리 다음(시계방향)의 참가자
    const seats = eligible.map((p) => p.seat);
    let dealerIndex;
    if (this.dealerSeat === null) dealerIndex = crypto.randomInt(eligible.length);
    else {
      dealerIndex = seats.findIndex((s) => s > this.dealerSeat);
      if (dealerIndex === -1) dealerIndex = 0;
    }
    this.dealerSeat = seats[dealerIndex];
    this.handNo += 1;
    this.handPlayers = eligible.map((p) => p.id);
    bot.observeDeal(this.stats, this.handPlayers);
    const players = eligible.map((p) => ({ id: p.id, stack: p.stack }));
    if (this.settings.game === 'omok') {
      // 판마다 흑백을 바꾼다 (첫 번째 = 흑)
      const two = players.slice(0, 2);
      if (this.handNo % 2 === 0) two.reverse();
      this.hand = new OmokGame({ players: two, dealerIndex: 0 });
    } else if (this.settings.game === 'seotda') {
      this.hand = SeotdaHand.create({ players, dealerIndex, bb: this.blinds().bb, carry });
      if (carry) this.pushFeed(`🎴 재경기 · 이월된 판돈 ${carry.amount.toLocaleString()}`);
    } else {
      this.hand = new Hand({ players, dealerIndex, sb: this.blinds().sb, bb: this.blinds().bb });
    }
    this.lastSeenLog = 0;
    this.pushFeed(`${this.handNo}번째 판 시작 · 딜러 ${this.name(eligible[dealerIndex].id)}`);
    this.syncStacks();
    this.afterHandChange();
    return true;
  }

  syncStacks() {
    if (!this.hand) return;
    for (const s of this.hand.seats) {
      const p = this.get(s.id);
      if (p) p.stack = s.stack;
    }
  }

  act(id, action) {
    if (!this.hand || this.hand.finished) throw new RoomError('진행 중인 판이 없어요');
    try {
      this.hand.act(id, action);
    } catch (e) {
      if (e instanceof IllegalAction) throw new RoomError(e.message);
      throw e;
    }
    const p = this.get(id);
    if (p) p.timeouts = 0;
    const seat = this.hand.seatOf(id);
    if (seat && seat.lastAction) bot.observeAct(this.stats, id, seat.lastAction, this.handNo);
    this.syncStacks();
    this.afterHandChange();
  }

  afterHandChange() {
    this.clearTimer('turn');
    this.clearTimer('bot');
    this.clearTimer('auto');
    this.turnDeadline = null;
    if (!this.hand) { this.touch(); return; }
    if (this.hand.finished) {
      this.onHandFinished(); // 연출 상태를 먼저 정해야 공개 전 기록(리버·승리)이 새지 않는다
      this.drainHandLog();
    } else {
      this.drainHandLog();
      const ms = this.settings.turnSeconds * 1000;
      this.turnDeadline = this.now() + ms;
      this.setTimer('turn', ms, () => this.onTurnTimeout());
      const cur = this.get(this.hand.currentId);
      if (cur && this.isAway(cur)) {
        const id = cur.id;
        this.setTimer('auto', 700 * this.pace, () => {
          if (!this.hand || this.hand.finished || this.hand.currentId !== id) return;
          this.hand.autoAct(id);
          this.syncStacks();
          this.afterHandChange();
        });
      } else if (cur && cur.isBot) {
        const think = BOT_THINK[0] + crypto.randomInt(BOT_THINK[1] - BOT_THINK[0]);
        this.setTimer('bot', think * this.pace, () => this.botTurn());
      }
    }
    this.touch();
  }

  /** 엔진 로그를 화면용 기록(번호 붙임)으로 옮긴다 */
  drainHandLog() {
    if (!this.hand) return;
    const log = this.hand.log;
    while (this.lastSeenLog < log.length) {
      const e = log[this.lastSeenLog];
      const rv = this.reveal;
      if (rv && !rv.done && ((e.type === 'street' && e.board.length > rv.board) || e.type === 'end')) break;
      this.lastSeenLog++;
      this.logSeq += 1;
      this.feed.push({ seq: this.logSeq, hand: this.handNo, ...e, name: e.id ? this.name(e.id) : undefined, text: this.describe(e) });
    }
    if (this.feed.length > 60) this.feed.splice(0, this.feed.length - 60);
  }

  describe(e) {
    const n = e.id ? this.name(e.id) : '';
    const amt = (v) => Number(v).toLocaleString();
    switch (e.type) {
      case 'blind': return `${n} ${e.label} ${amt(e.amount)}`;
      case 'fold': return e.forced ? `${n} 폴드 (자리 떠남)` : `${n} 폴드`;
      case 'check': return `${n} 체크`;
      case 'call': return `${n} 콜 ${amt(e.amount)}`;
      case 'bet': return `${n} 베팅 ${amt(e.to)}`;
      case 'raise': return `${n} 레이즈 ${amt(e.to)}까지`;
      case 'allin': return `${n} 올인 (${amt(e.to)})`;
      case 'street': return { 3: '플랍', 4: '턴', 5: '리버' }[e.board.length] + ' 공개';
      case 'place': return `${n} ${e.color === 'b' ? '⚫' : '⚪'} ${String.fromCharCode(65 + e.x)}${e.y + 1}`;
      case 'resign': return `${n} 기권`;
      case 'end': return e.result === 'draw' ? '무승부' : e.result === 'redeal' ? `${e.redeal}! 재경기` : `${e.winners.map((w) => this.name(w)).join(', ')} 승리`;
      default: return '';
    }
  }

  pushFeed(text) {
    this.logSeq += 1;
    this.feed.push({ seq: this.logSeq, hand: this.handNo, type: 'info', text });
    if (this.feed.length > 60) this.feed.splice(0, this.feed.length - 60);
  }

  onTurnTimeout() {
    if (!this.hand || this.hand.finished) return;
    const id = this.hand.currentId;
    const p = this.get(id);
    const did = this.hand.autoAct(id);
    if (p) {
      p.timeouts += 1;
      this.pushFeed(`${p.name}님 시간 초과 → ${did === 'place' ? '자동으로 한 수 둠' : `자동 ${did === 'check' ? '체크' : '폴드'}`}`);
      if (p.timeouts >= MAX_TIMEOUTS) {
        p.sittingOut = true;
        this.pushFeed(`${p.name}님은 자리 비움으로 바뀌었어요 (차례가 오면 자동 체크/다이)`);
      }
    }
    this.syncStacks();
    this.afterHandChange();
  }

  onHandFinished() {
    const h = this.hand;
    if (this.reveal && this.reveal.handNo === this.handNo) return; // 이미 연출 중
    if (h.result.type !== 'showdown') { this.reveal = null; this.finishReveal(); return; }

    // 쇼다운 연출 순서 만들기
    const from = h.runoutFrom !== undefined ? h.runoutFrom : h.board.length;
    const allin = !this.hand.kind && from < 5; // 올인 런아웃 연출은 홀덤만
    const order = h.orderFromButton().filter((id) => h.result.hands[id]);
    const rv = { handNo: this.handNo, allin, board: from, shown: [], squeeze: false, done: false, stage: allin ? 'allin' : 'showdown' };
    this.reveal = rv;
    const steps = [];
    const P = this.pace;
    if (allin) {
      steps.push([REVEAL.first, () => { rv.shown = order.slice(); }]);
      if (from < 3) steps.push([REVEAL.allinHands, () => { rv.board = 3; }]);
      if (from < 4) steps.push([from < 3 ? REVEAL.flop : REVEAL.allinHands, () => { rv.board = 4; }]);
      steps.push([from < 4 ? REVEAL.turn : REVEAL.allinHands, () => { rv.squeeze = true; }]);
      steps.push([REVEAL.squeeze, () => { rv.squeeze = false; rv.board = 5; }]);
      steps.push([REVEAL.river, () => {}]);
    } else {
      order.forEach((id, i) => steps.push([i === 0 ? REVEAL.first : REVEAL.perHand, () => { rv.shown.push(id); }]));
      steps.push([REVEAL.perHand, () => {}]);
    }
    const run = (i) => {
      if (this.reveal !== rv) return;
      if (i >= steps.length) { this.finishReveal(); return; }
      this.setTimer('reveal', steps[i][0] * P, () => { steps[i][1](); this.drainHandLog(); this.touch(); run(i + 1); });
    };
    run(0);
  }

  /** 연출이 끝나면 결과·칩 이동을 공개하고 다음 판 예약 */
  finishReveal() {
    if (this.reveal) { this.reveal.done = true; this.reveal.squeeze = false; this.reveal.board = 5; }
    this.drainHandLog();
    this.lastResult = { handNo: this.handNo, ...this.hand.result };
    try { this.recordResult(); } catch (e) { console.error('[record]', e); }
    if (this.hand.result.redeal) {
      this.seotdaCarry = this.hand.result.carry;
      this.pushFeed(`🎴 ${this.hand.result.redeal}! 판돈 ${this.seotdaCarry.amount.toLocaleString()}을 걸고 다시 쳐요`);
    }
    this.botEmotes(this.hand.result);
    for (const p of this.seated) {
      if (p.stack === 0 && p.pendingRebuy === 0) {
        this.pushFeed(this.canRebuy(p) ? `${p.name}님 칩 소진 · 리바인할 수 있어요` : `${p.name}님 칩 소진`);
      }
    }
    const delay = (RESULT_DELAY[this.hand.result.type] || 5000) * this.pace;
    this.nextHandAt = this.now() + delay;
    this.setTimer('next', delay, () => this.startHand());
    this.touch();
  }

  /** 전적 기록용 요약을 만들어 onRecord 로 넘긴다 */
  recordResult() {
    const h = this.hand;
    const r = h.result;
    const game = h.kind || 'holdem';
    if (game === 'omok') {
      const [a, b] = h.seats.map((s) => this.get(s.id) || { id: s.id });
      const side = (p) => ({ id: p.id, userId: p.userId || null, ai: p.isBot ? this.settings.aiLevel : null });
      const res = r.type === 'draw' ? 'draw' : r.winners.includes(h.seats[0].id) ? 'a' : 'b';
      this.onRecord({ game, a: side(a), b: side(b), result: res });
      return;
    }
    const players = this.handPlayers.map((id) => {
      const p = this.get(id) || {};
      const hi = r.hands && r.hands[id];
      return { id, userId: p.userId || null, delta: r.deltas[id] || 0, won: r.winners.includes(id), handName: hi ? hi.name : null, handRank: hi ? (typeof hi.rank === 'number' ? hi.rank : hi.category) : null };
    });
    this.onRecord({ game, players, pot: h.totalPot, redeal: !!r.redeal });
  }

  get revealing() { return !!(this.reveal && !this.reveal.done && this.hand && this.hand.finished); }

  /** 토너먼트 끝: 순위 정리 후 대기실로 */
  finishTournament(winner) {
    const t = this.tourney;
    const order = [];
    if (winner) order.push(winner.id);
    for (const id of [...t.busted].reverse()) if (!order.includes(id)) order.push(id);
    t.result = { at: this.now(), ranking: order.map((id, i) => ({ id, name: this.name(id), place: i + 1 })) };
    try { this.onRecord({ game: 'tourney', userIds: this.players.filter((p) => p.userId && order.includes(p.id)).map((p) => p.userId), winnerUserId: winner && winner.userId }); } catch {}
    this.pushFeed(winner ? `🏆 ${winner.name}님 토너먼트 우승!` : '토너먼트가 끝났어요');
    this.phase = 'lobby';
    this.hand = null;
    this.handPlayers = [];
    this.nextHandAt = null;
    this.waiting = false;
    this.clearTimer('next');
    for (const p of this.players) p.ready = !!p.isBot;
    this.touch();
  }

  /** 누군가 돌아오거나 리바인해서 판을 시작할 수 있게 됐는지 확인 */
  maybeStartWaitingHand() {
    const el = this.eligibleForHand();
    if (this.phase === 'playing' && this.waiting && el.length >= 2 && el.some((p) => !p.isBot && !this.isAway(p))) {
      this.nextHandAt = this.now() + 2000;
      this.setTimer('next', 2000, () => this.startHand());
    }
  }

  // ── 리바인 ──────────────────────────────────────────
  canRebuy(p) {
    const s = this.settings;
    if (!s.rebuyEnabled || this.phase !== 'playing' || p.role !== 'player') return false;
    if (p.rebuys >= s.rebuyMax || p.pendingRebuy > 0) return false;
    if (this.revealing) return false; // 결과 공개 전에는 칩 상태를 드러내지 않는다
    return this.effectiveStack(p) < s.startChips / 2; // 시작 칩의 절반 미만(0 포함)일 때
  }

  /** 진행 중인 판에 걸어 둔 칩은 아직 잃은 게 아니므로 더해서 본다 */
  effectiveStack(p) {
    const hs = this.hand && !this.hand.finished ? this.hand.seatOf(p.id) : null;
    return p.stack + (hs ? hs.contributed : 0);
  }

  rebuy(id) {
    const p = this.get(id);
    if (!p) throw new RoomError('참가자를 찾을 수 없어요');
    if (!this.settings.rebuyEnabled) throw new RoomError('이 방은 리바인이 꺼져 있어요');
    if (p.rebuys >= this.settings.rebuyMax) throw new RoomError(`리바인은 최대 ${this.settings.rebuyMax}번까지예요`);
    if (p.pendingRebuy > 0) throw new RoomError('이미 신청했어요. 다음 판부터 적용돼요');
    if (!this.canRebuy(p)) throw new RoomError('칩이 시작 칩의 절반보다 적을 때만 리바인할 수 있어요');
    p.rebuys += 1;
    p.pendingRebuy = this.settings.rebuyAmount;
    p.sittingOut = false;
    this.pushFeed(`${p.name}님 리바인 신청 (${p.rebuys}/${this.settings.rebuyMax}) · 다음 판부터 적용`);
    this.maybeStartWaitingHand();
    this.touch();
  }

  sitIn(id) {
    const p = this.get(id);
    if (!p) return;
    p.sittingOut = false;
    p.timeouts = 0;
    this.pushFeed(`${p.name}님이 자리로 돌아왔어요`);
    this.maybeStartWaitingHand();
    this.touch();
  }

  sitOut(id) {
    const p = this.get(id);
    if (!p || p.role !== 'player') return;
    p.sittingOut = true;
    this.pushFeed(`${p.name}님이 자리를 비웠어요 (차례가 오면 자동 체크/다이)`);
    // 지금 내 차례였다면 바로 자동 처리되도록 타이머를 다시 건다
    if (this.hand && !this.hand.finished && this.hand.currentId === id) this.afterHandChange();
    this.touch();
  }

  // ── 연결·퇴장·방장 ─────────────────────────────────
  connect(id) {
    const p = this.get(id);
    if (!p) return;
    const wasAway = !p.connected;
    p.connected = true;
    p.disconnectedAt = null;
    if (wasAway) this.maybeStartWaitingHand();
    this.touch();
  }

  disconnect(id) {
    const p = this.get(id);
    if (!p) return;
    p.connected = false;
    p.disconnectedAt = this.now();
    if (id === this.hostId) {
      this.setTimer('host', HOST_GRACE_MS, () => {
        const h = this.host;
        if (h && !h.connected) this.transferHostAuto(`방장 ${h.name}님의 연결이 끊겨`);
      });
    }
    this.touch();
  }

  pickNextHost(excludeId) {
    const cands = this.players
      .filter((p) => p.id !== excludeId && !p.leaving && p.connected && !p.isBot)
      .sort((a, b) => (a.role === 'player' ? 0 : 1) - (b.role === 'player' ? 0 : 1) || a.joinedAt - b.joinedAt);
    return cands[0] || null;
  }

  transferHostAuto(reason) {
    const next = this.pickNextHost(this.hostId);
    if (!next) return;
    this.hostId = next.id;
    this.pushFeed(`${reason} ${next.name}님이 새 방장이 됐어요`);
    this.touch();
  }

  transferHost(hostId, targetId) {
    this.requireHost(hostId);
    const t = this.get(targetId);
    if (!t || t.leaving) throw new RoomError('넘길 사람을 찾을 수 없어요');
    this.hostId = t.id;
    this.pushFeed(`방장이 ${t.name}님으로 바뀌었어요`);
    this.touch();
  }

  leave(id, reason = '나갔어요') {
    const p = this.get(id);
    if (!p) {
      const pi = this.pending.findIndex((x) => x.id === id);
      if (pi >= 0) this.pending.splice(pi, 1);
      return;
    }
    const inHand = this.hand && !this.hand.finished && this.handPlayers.includes(id);
    if (inHand) {
      p.leaving = true;
      this.hand.forceFold(id);
      this.syncStacks();
      this.afterHandChange();
    } else {
      this.players = this.players.filter((x) => x.id !== id);
    }
    this.pushFeed(`${p.name}님이 ${reason}`);
    if (id === this.hostId) {
      const next = this.pickNextHost(id) || this.players.find((x) => x.id !== id && !x.leaving && !x.isBot);
      this.hostId = next ? next.id : null;
      if (next) this.pushFeed(`${next.name}님이 새 방장이 됐어요`);
    }
    this.touch();
  }

  kick(hostId, targetId) {
    this.requireHost(hostId);
    if (targetId === hostId) throw new RoomError('자기 자신은 내보낼 수 없어요');
    const p = this.get(targetId);
    if (!p) throw new RoomError('참가자를 찾을 수 없어요');
    p.kicked = true;
    this.leave(targetId, '방장에 의해 내보내졌어요');
    p.token = null;
  }

  get isEmpty() {
    return this.players.filter((p) => !p.leaving && !p.isBot).length === 0;
  }

  // ── 타이머 ─────────────────────────────────────────
  setTimer(key, ms, fn) {
    this.clearTimer(key);
    this.timers[key] = setTimeout(() => {
      delete this.timers[key];
      try { fn(); } catch (e) { console.error('[timer]', e); }
      try { this.onChange(this); } catch (e) { console.error('[broadcast]', e); } // 한 방의 오류로 서버가 꺼지지 않게
    }, Math.max(0, ms));
    if (this.timers[key].unref) this.timers[key].unref();
  }

  clearTimer(key) {
    if (this.timers[key]) { clearTimeout(this.timers[key]); delete this.timers[key]; }
  }

  clearAllTimers() { for (const k of Object.keys(this.timers)) this.clearTimer(k); }

  touch() { this.touchedAt = this.now(); }

  // ── 화면 데이터: 각자 볼 수 있는 정보만 ───────────────
  viewFor(viewerId) {
    const me = this.get(viewerId) || null;
    const h = this.hand;
    const showdown = h && h.finished && h.result && h.result.type === 'showdown';
    const n = h ? h.seats.length : 0;
    const seatId = (i) => (h && h.seats[i] ? h.seats[i].id : null); // 오목에는 딜러·블라인드가 없다
    const dealerId = h && h.kind !== 'omok' ? seatId(h.dealerIndex) : null;
    const sbId = h && !h.kind ? seatId(h.sbIndex) : null;
    const bbId = h && !h.kind ? seatId(h.bbIndex) : null;
    const rv = this.revealing ? this.reveal : null;           // 쇼다운 연출 중이면 아직 결과를 숨긴다
    const payouts = rv && h.result ? h.result.payouts : {};
    const shownStack = (p) => p.stack - (payouts[p.id] || 0);

    const players = this.players.filter((p) => !(p.leaving && !(h && h.seatOf(p.id)))).map((p) => {
      const hs = h ? h.seatOf(p.id) : null;
      let status = 'waiting';
      if (p.role === 'spectator') status = 'spectator';
      else if (hs) status = hs.folded ? 'folded' : hs.allIn ? 'allin' : 'inhand';
      else if (this.phase === 'playing' && shownStack(p) + p.pendingRebuy === 0) status = 'busted';
      else if (p.sittingOut) status = 'away';
      let cards = null;
      if (hs) {
        if (p.id === viewerId) cards = hs.hole;
        else if (showdown && h.result.hands[p.id] && (!rv || rv.shown.includes(p.id))) cards = h.result.hands[p.id].hole;
        else if (!hs.folded) cards = ['??', '??'];
      }
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        role: p.role,
        seat: p.seat,
        stack: shownStack(p),
        pendingRebuy: p.pendingRebuy,
        rebuys: p.rebuys,
        ready: p.ready,
        connected: p.connected,
        isBot: !!p.isBot,
        photo: p.photo ? p.photoV : 0,
        member: !!p.userId,
        rating: p.userId && this.settings.game === 'omok' ? p.omokRating : null,
        isHost: p.id === this.hostId,
        sittingOut: p.sittingOut,
        leaving: p.leaving,
        status,
        bet: hs ? hs.bet : 0,
        lastAction: hs ? hs.lastAction : null,
        cards,
        isDealer: p.id === dealerId,
        isSB: n > 2 && p.id === sbId,
        isBB: p.id === bbId,
        isTurn: h && !h.finished && h.currentId === p.id,
      };
    });

    const view = {
      serverTime: this.now(),
      room: {
        code: this.code,
        phase: this.phase,
        hostId: this.hostId,
        handNo: this.handNo,
        waiting: !!this.waiting,
        tournament: this.isTournament ? this.tourneyView() : null,
        practice: !!this.practice,
        nextHandAt: this.nextHandAt,
        settings: { ...this.settings, password: undefined, hasPassword: !!this.settings.password },
        startBlocker: this.phase === 'lobby' ? this.startCheck() : null,
      },
      me: me && {
        id: me.id,
        name: me.name,
        role: me.role,
        seat: me.seat,
        isHost: me.id === this.hostId,
        stack: shownStack(me),
        ready: me.ready,
        rebuys: me.rebuys,
        pendingRebuy: me.pendingRebuy,
        canRebuy: this.canRebuy(me),
        sittingOut: me.sittingOut,
      },
      players,
      feed: this.feed.slice(-40),
      hand: null,
    };

    if (me && me.id === this.hostId) {
      view.pending = this.pending.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, photo: p.photo ? p.photoV : 0 }));
      view.room.settings.password = this.settings.password;
    }

    if (h) {
      const hasAllIn = h.seats.some((s) => s.allIn);
      const omok = h.kind === 'omok' ? {
        size: 15, cells: h.cells, lastMove: h.lastMove, moves: h.moves.length,
        colors: Object.fromEntries(h.seats.map((s) => [s.id, s.color])),
        winLine: h.result ? h.result.winLine || null : null,
      } : null;
      view.hand = {
        game: h.kind || 'holdem',
        omok,
        no: this.handNo,
        stage: rv ? (rv.allin ? 'allin' : 'showdown') : h.stage,
        board: rv ? h.board.slice(0, rv.board) : h.board.slice(),
        reveal: rv ? { allin: rv.allin, squeeze: rv.squeeze, shown: rv.shown.length } : null,
        pot: h.collectedPot,
        totalPot: h.totalPot,
        pots: hasAllIn ? h.potsView().map((pt) => ({ amount: pt.amount, count: pt.eligible.length })) : null,
        currentBet: h.currentBet,
        minRaise: h.minRaise,
        toActId: h.finished ? null : h.currentId,
        deadline: this.turnDeadline,
        turnSeconds: this.settings.turnSeconds,
        finished: h.finished,
        legal: me ? h.legalActions(me.id) : null,
        result: h.finished && !rv ? this.publicResult(h.result) : null,
      };
    }
    return view;
  }

  tourneyView() {
    const t = this.tourney;
    const lvl = t && this.phase === 'playing' ? t.level : 0;
    const cur = levelBlinds(this.settings, lvl);
    const next = levelBlinds(this.settings, Math.min(lvl + 1, LEVEL_MULT.length - 1));
    return {
      running: !!(t && this.phase === 'playing'),
      level: lvl + 1,
      sb: cur.sb, bb: cur.bb,
      nextSb: next.sb, nextBb: next.bb,
      nextAt: t && this.phase === 'playing' ? t.startedAt + (lvl + 1) * this.settings.levelMinutes * 60000 : null,
      levelMinutes: this.settings.levelMinutes,
      alive: this.seated.filter((p) => p.stack > 0).length,
      entrants: t ? t.entrants : this.seated.length,
      result: t && t.result ? t.result : null,
    };
  }

  publicResult(r) {
    const hands = {};
    for (const [id, v] of Object.entries(r.hands || {})) {
      hands[id] = { hole: v.hole, best: v.best, name: v.name, category: v.category };
    }
    return {
      type: r.type,
      winners: r.winners,
      winnerNames: r.winners.map((w) => this.name(w)),
      reason: r.reason || null,
      redeal: r.redeal || null,
      carry: r.carry ? r.carry.amount : 0,
      board: r.board,
      hands,
      pots: r.potResults.map((p) => ({ amount: p.amount, winners: p.winners, returned: p.eligible.length === 1 })),
      deltas: r.deltas,
    };
  }

  // ── 저장/복구 ─────────────────────────────────────
  serialize() {
    const { timers, onChange, onEmote, emoteAt, now, hand, ...rest } = this;
    return { ...rest, hand: hand ? hand.toJSON() : null };
  }

  static restore(obj, now = Date.now) {
    const r = new Room({ code: obj.code, settings: obj.settings, now });
    const { hand, ...rest } = obj;
    Object.assign(r, rest);
    r.timers = {};
    r.hand = hand ? (hand.kind === 'seotda' ? SeotdaHand.fromJSON(hand) : hand.kind === 'omok' ? OmokGame.fromJSON(hand) : Hand.fromJSON(hand)) : null;
    if (r.reveal) { r.reveal.done = true; r.reveal.board = 5; r.reveal.squeeze = false; } // 재시작하면 연출은 건너뜀
    for (const p of r.players) { if (p.isBot) continue; p.connected = false; p.disconnectedAt = p.disconnectedAt || now(); }
    r.setTimer('host', HOST_GRACE_MS, () => {
      const h = r.host;
      if (h && !h.connected) r.transferHostAuto(`방장 ${h.name}님의 연결이 끊겨`);
    });
    // 타이머 다시 걸기
    if (r.hand && !r.hand.finished) {
      const left = Math.max(5000, (r.turnDeadline || 0) - now());
      r.turnDeadline = now() + left;
      r.setTimer('turn', left, () => r.onTurnTimeout());
      const cur = r.get(r.hand.currentId);
      if (cur && cur.isBot) r.setTimer('bot', 1500, () => r.botTurn());
    } else if (r.phase === 'playing') {
      const left = Math.max(3000, (r.nextHandAt || 0) - now());
      r.nextHandAt = now() + left;
      r.setTimer('next', left, () => r.startHand());
    }
    return r;
  }
}

module.exports = { levelBlinds, cleanPhoto, EMOTES, Room, RoomError, sanitizeSettings, DEFAULT_SETTINGS, makeCode, cleanName };
