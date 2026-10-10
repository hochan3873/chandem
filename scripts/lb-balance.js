'use strict';
// 랑방 대전 밸런스 점검 — sim.js 는 DOM 없는 순수 모듈이라 Node 에서 그대로 돌린다.
//   node scripts/lb-balance.js            전부 (영웅 레벨 곡선 · 스테이지 표 · 캠페인)
//   node scripts/lb-balance.js curve       영웅 혼자 Lv1~5 DPS
//   node scripts/lb-balance.js stages      방장 + 동료별, 정해진 강화 수준으로 주요 스테이지 여러 판
//   node scripts/lb-balance.js campaign    0코인에서 시작해 보상으로 강화하며 1-1 → 3-10 진행
//   옵션: --seeds=N (판 수), --plays=N (캠페인 최대 판 수)
//   node scripts/lb-balance.js deck [--ch=2,3] [--nos=3,4,...] [--value=b] [--meta=6] [--hell] [--misdump]
//        덱 구성: 딜러만 덱 vs 균형 덱(딜러 핵심 + 조건 맞춤 서포터 · 유틸) · 같은 강화 · --value: 멤버를 '아무것도 안 하는 멤버'로 바꿨을 때 하락 = 가치
//   node scripts/lb-balance.js attr [--notypes] [--meta=-2]   한 속성 덱의 장별 클리어율 (상성 켬/끔)
//   node scripts/lb-balance.js diag --list=56 --deck=a|b|id+id   한 판씩 자세히 (조건 · 미션 숫자 · 팀 기여)
//   node scripts/lb-balance.js stagecalib --list=41 · condcalib · custom --decks=a+b|c+d   맞춤 · 아무 덱
//   node scripts/lb-balance.js stagecalib --list=1,2,...,80 [--seeds=16 --range=4]   기준 플레이어 첫 도전 클리어율이 목표가 되게 stageAdd 이분 탐색 (1~8장 · 테스트 가드레일 안에서)
//        기준 플레이어 = 사람처럼 (스킬 1.5초 늦게 · 카드 40% 아무거나) · 강화 장 권장+2 · 주력 ★ · 도감 보너스 (--pro : 예전 완벽한 봇 · --bare : ★ · 도감 빼기)
//   node scripts/lb-balance.js room   스테이지마다 가드레일(첫 웨이브 · 최고 레벨 · 체력 배율)까지 남은 난이도
//   node scripts/lb-balance.js stagemeas --list=1,...,80 [--hell] [--seedoff=K] [--quiet]   측정만 · 장 평균 vs 목표
//   node scripts/lb-balance.js wtrait --list=8,15,25 [--seeds=4] [--traits=near,swarm]   주간 진상 특성마다 균형 덱 클리어율 · 입구 (특성 없음과 비교)
//   node scripts/lb-par.js deck --ch=2,3,4,5,6 ...   장마다 따로 띄워 병렬로
const path = require('path');
const { pathToFileURL } = require('url');
// --lib=폴더 : 다른 버전(예: 바꾸기 전 복사본)의 data.js · sim.js 로 같은 검사를 돌린다
const LIB = (process.argv.find((x) => x.startsWith('--lib=')) || '').slice(6) || path.join(__dirname, '..', 'public', 'langbang');
const load = (f) => import(pathToFileURL(path.join(LIB, f)).href);

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d; };
const what = args.find((x) => !x.startsWith('--')) || 'all';
const JOIN_MODE = args.includes('--join'); // --join: 대장 1명 시작 · 레벨업 카드로 합류
const TEMPO_MODE = args.includes('--tempo');
const COND_ARG = (() => { const v = (process.argv.find((x) => x.startsWith('--conds=')) || '').slice(8); return v ? (v === 'none' ? [] : v.split(',')) : undefined; })(); // --conds=shield,cc | none : 스테이지 조건을 바꿔서 측정
let WTR = (process.argv.find((x) => x.startsWith('--wtrait=')) || '').slice(9) || undefined; // --wtrait=swarm : 주간 진상 특성 켜고 측정
const NOSOFT = args.includes('--nosoft'); // 강화 권장 상한(넘는 만큼 절반) 끄기 // --tempo: 느리고 묵직한 전투 (진상 수 ×0.6 · 공속 ÷1.54 · 한 방 ×1.6 · 스킬 쿨 ×1.5)
const PARTNERS = ((process.argv.find((x) => x.startsWith('--partners=')) || '').slice(11) || 'staff,gunman,gunnyeo,dohoon,myunghoon,ingyu,donghan,youngjun,eunok,hanna,sunggu').split(',');
const NAME = { bangjang: '방장', staff: '운영진', gunman: '건전남', gunnyeo: '건전녀', eunok: '최은옥', hanna: '이한나', sunggu: '강성구', myunghoon: '서명훈', dohoon: '김도훈', ingyu: '백인규', donghan: '문동한', youngjun: '김영준', ara: '고아라', jiwon: '여지원', wonsik: '정원식', jungmin: '홍정민', hochan: '이호찬', byunghwa: '강병화', hyungyeong: '배현경', jeongseob: '윤정섭', soyoung: '정소영', jieun: '오지은', sanghwa: '박상화', baul: '송바울', junseo: '윤준서', subin: '임수빈' };
const pad = (s, n) => { s = String(s); let w = 0; for (const ch of s) w += /[가-힣]/.test(ch) ? 2 : 1; return s + ' '.repeat(Math.max(0, n - w)); };

// mulberry32 (10/07): 예전 LCG 는 시드가 173 · 11 씩만 달라 판끼리 · 스테이지끼리 난수가 묶여서 (같은 장 스테이지가 한꺼번에 쉽거나 어렵게) 장 평균이 시드 묶음마다 ±15%p 씩 흔들렸다
function seeded(seed = 1) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

(async () => {
  const D = await load('data.js');
  // --condsfrom=폴더 : 균형 덱을 고를 때 쓰는 스테이지 조건을 다른 버전(지금 버전)에서 (바꾸기 전 버전과 같은 덱으로 비교)
  const CF = (process.argv.find((x) => x.startsWith('--condsfrom=')) || '').slice(12);
  const DC = CF ? await import(pathToFileURL(path.join(CF, 'data.js')).href) : D;
  const S = await load('sim.js');
  // --tune=crowd.k:4,crowd.cap:7,repair.frac:0.3,SLOW_RUN.door:0.8,HELL.hp:2.5 … : 숫자를 바꿔 보며 측정 (TENSION 아래는 'crowd.k' 처럼 짧게)
  for (const kv of ((process.argv.find((x) => x.startsWith('--tune=')) || '').slice(7)).split(',').filter(Boolean)) {
    const [k, v] = kv.split(':'), path0 = k.split('.'), root = /^[A-Z]/.test(path0[0]) ? D : D.TENSION;
    let o = root; for (const q of path0.slice(0, -1)) o = o[q];
    const last = path0[path0.length - 1];
    if (v.includes('-')) o[last] = v.split('-').map(Number); else if (Array.isArray(o[last])) o[last] = o[last].map((x) => x * Number(v)); else o[last] = Number(v); // (2-3-4 : 목록으로)
  }

  // 카드 자동 선택: 사람이 고를 법한 단순한 우선순위 + 약간의 무작위
  //  --policy=smart (기본, 잘 고르는 사람) | mid (10번 중 4번은 아무거나 — 보통 사람) | random
  // 기준 플레이어 측정 (stagecalib · stagemeas · wtrait)은 사람처럼: 스킬은 1.5초쯤 늦게 (90스텝) · 카드는 40% 는 아무거나 (mid)
  //  (예전 기준 = 0.1초마다 스킬 · 늘 최선의 카드 — 사람보다 훨씬 잘해서 목표 클리어율이 의미가 없었다: 10/03 재보정 메모)
  const REF_HUMAN = ['stagecalib', 'stagemeas', 'wtrait', 'foes', 'tension', 'cardstat', 'chcalib', 'skshare'].includes(what) && !args.includes('--pro');
  const FOES = what === 'foes';
  const POLICY = (process.argv.find((x) => x.startsWith('--policy=')) || '').slice(9) || (REF_HUMAN ? 'mid' : 'smart');
  const LV_FIRST = args.includes('--lvfirst');
  function pickCard(g, cards, rng) {
    const P = g._policy || POLICY; // (o.policy: 판마다 — 초보 봇은 random)
    if (P === 'random' || (P === 'mid' && rng() < 0.4)) return (rng() * cards.length) | 0;
    let best = 0, bv = -1;
    cards.forEach((c, i) => {
      let v = 1;
      if (c.kind === 'join') v = 9; // 합류 카드: 사람들은 거의 고른다
      else if (c.rarity === 'hidden') v = 10;
      else if (c.kind === 'addHero') v = g.heroes.length < 4 ? 8 : 5;
      else if (c.kind === 'heroLv') {
        const h = S.hasHero(g, c.hero);
        v = 6 + (h.lv + 1 === 3 || h.lv + 1 === 5 ? 2.5 : 0) + (h.def.hidden ? 1 : 0) + (h.id === g.partner ? 1 : 0) + (LV_FIRST ? 4 : 0); // --lvfirst: 멤버 레벨 카드부터 (다 키우는 사람)
      } else if (c.kind === 'evo') v = 9.5;
      else if (c.kind === 'secret') v = 9;
      else if (c.kind === 'skillEvo') v = SKILLS ? 8 : 3;
      else if (c.kind === 'heroMod') v = 6.5;
      else if (c.kind === 'global') {
        const tagN = (t) => g.heroes.filter((h) => (D.HERO_TAGS[h.id] || []).includes(t)).length;
        if (c.attr) v = 4.2 + 1.6 * (g.attrCount[c.attr] || 0);
        else if (c.tag && c.tag !== 'boss') v = 2.6 + 1.7 * tagN(c.tag);
        else v = { dmg: 6.5, spd: 6, boss: 8, pierce: 7.5, crit: 5, gunExtra: 7, hp: g.base.hp / g.base.max < 0.6 ? 6 : 3.5, regen: 4.5, ult: 3.5, exp: 3.5, slow: 4, charmRes: 2.5,
          tag_boss: g.stage % 5 === 0 ? 6.5 : 3.5, swarm: 5, tr_heavy: 5.5, tr_rapid: 5, tr_skill: SKILLS ? 7 : 1, tr_wall: g.base.hp / g.base.max < 0.7 ? 7 : 3, tr_hunt: 2.5 + 1.5 * tagN('ctrl'), tr_boom: g.cond && g.cond.swarm ? 7 : 4.5, jp_party: 11, jp_power: 11, jp_mom: SKILLS ? 11 : 6, risk_allin: g.base.hp / g.base.max > 0.75 ? 6.5 : 2, risk_overtime: g.wave <= 2 ? 4.5 : 2, risk_glass: 4.5, econ_bonus: 6 }[c.id] || 2;
      } else if (c.kind === 'filler') v = c.id === 'fillHeal' && g.base.hp / g.base.max < 0.6 ? 5 : 1;
      v += rng() * 1.5;
      if (v > bv) { bv = v; best = i; }
    });
    return best;
  }

  // 스킬 자동 사용 (--skills=1): 준비되면 바로. 찍는 스킬은 진상이 가장 몰린 곳에
  const SKILLS = opt('skills', 0) > 0;
  const HUMAN_T = REF_HUMAN || (what === 'powercalib' && !args.includes('--pro')); // 전투력 측정도 기준 플레이어처럼 (스킬 · 보드 탭을 사람 손 빠르기로 — 카드는 smart 그대로: 판마다 흔들림 줄이기)
  const SKILL_EVERY = opt('skillevery', HUMAN_T ? 90 : 6);
  const BOARD_EVERY = opt('boardevery', HUMAN_T ? 50 : 30); // 송바울 탭 간격 (스텝)
  const PICK_DELAY = opt('pickdelay', 2); // 스킬 확인 간격(스텝): 90 이면 보통 사람처럼 1.5초쯤 늦게
  function densest(g, r) {
    let best = null, bn = 0;
    for (const e of g.enemies) {
      if (e.dead || e.y < 0) continue;
      let n = 0;
      for (const o of g.enemies) if (!o.dead && Math.abs(o.x - e.x) < r && Math.abs(o.y - e.y) < r) n += o.boss ? 3 : 1;
      if (n > bn) { bn = n; best = e; }
    }
    return best ? { x: best.x, y: best.y, n: bn } : null;
  }
  function aiSkills(g, control) {
    const ready = (h) => h.id !== g._noSk && S.skillReady(h); // (skshare --member: 그 멤버 스킬만 끄기)
    // 컨트롤(7장): 눈사태 예고가 뜨면 0.6초쯤 뒤 아무 스킬로 끊고 · 예고가 곧 올 땐 스킬 하나를 아껴 둔다
    if (control) {
      const ava = g.avalanche && !g.avalanche.dead && g.avalanche.avaW > 0 ? g.avalanche : null;
      if (ava) { if (ava.def.avalanche.windup - ava.avaW > 0.6) for (const h of g.heroes) if (ready(h) && S.castSkill(g, h, ava.x, ava.y)) break; return; }
      const sp = g.speech && !g.speech.dead && g.speech.speechT > 0 ? g.speech : null; // 8장 축사: 스킬을 대표에게 몰아 게이지 채우기
      if (sp) { for (const h of g.heroes) if (ready(h)) S.castSkill(g, h, sp.x, sp.y); return; }
      const boss = g.enemies.find((e) => !e.dead && e.def.avalanche && e.y > 0);
      if (boss && boss.avaT < 4 && g.base.hp / g.base.max > 0.35) return;
    }
    // 입구 강타 예고(긴장감): 찍는 스킬로 끊는다 (사람도 빨간 예고를 보면 누른다)
    const slam = g.enemies.find((e) => !e.dead && e.cast && e.cast.spec.door && e.cast.t < e.cast.max - 0.3);
    if (slam) for (const h of g.heroes) if (ready(h) && h.def.skill.target && S.castSkill(g, h, slam.x, slam.y)) return;
    // (10/10 봇 손보기) 사람처럼:
    //  · 기세는 팀이 같이 쓰니 준비된 스킬 중 '가장 오래 안 쓴 멤버' 부터 (예전: 슬롯 순서대로 → 뒤에 합류한 멤버는 기세가 늘 모자라 스킬을 거의 못 씀)
    //  · 이호찬 막차 대행진(기세 2칸)은 아껴 둔다 — 쿨이 곧 돌면 다른 스킬은 기세를 안 쓰고 기다림 (예전: 한 판에 한 번도 못 씀)
    //  · 고아라 공주의 일격은 할머니일 때 · 보스에게 · 윤정섭 벽은 쉬거나 돌아올 때 입구 쪽에 진상이 몰리면
    let alive = 0, nearDoor = 0;
    for (const e of g.enemies) if (!e.dead && e.y > 0) { alive++; if (e.y > g.ropeY - 260) nearDoor++; }
    const hpF = g.base.hp / g.base.max, momOn = g.mom !== null && g.mom !== undefined;
    const hc = g.heroes.find((h) => h.def.skill && h.def.skill.id === 'forlangbang' && h.id !== g._noSk && !h.gone && !(h.kdT > 0) && !S.ultLocked(g, h));
    if (hc && hc.skillCd <= 3 && !args.includes('--noreserve')) {
      if (ready(hc) && (!momOn || g.mom >= D.MOMENTUM.per * 2) && (alive >= 5 || g.bossAlive)) { if (S.castSkill(g, hc)) hc._lastSk = g.t; return; }
      if (momOn && g.mom < D.MOMENTUM.max - 1 && hpF > 0.35) return; // 기세 모으는 중 (입구가 위험하면 다른 스킬도 쓴다)
    }
    const want = [];
    for (const h of g.heroes) {
      if (h === hc || !ready(h)) continue;
      const sk = h.def.skill;
      if (sk.target) {
        const c = densest(g, sk.r[h.lv - 1] * 0.8);
        if (c && (c.n >= 4 || g.bossAlive)) want.push([h, c.x, c.y]);
      } else if (sk.id === 'firstaid') {
        if (hpF < 0.8 || g.heroes.some((o) => o.stunT > 0.6 || o.rumorT > 0.5 || o.paperT > 0.5)) want.push([h]);
      } else if (sk.id === 'princess') {
        if ((h.alt && alive >= 1) || g.bossAlive || (alive >= 10 && h.skillCd <= 0 && !(h.ageT > 4))) want.push([h]);
      } else if (sk.id === 'oneshot') { // 최은옥 원샷: 분노는 스킬로만 → 정예 · 보스 · 떼로 몰릴 때 아껴서
        if (!h.rage && (g.bossAlive || alive >= 8 || g.enemies.some((e) => !e.dead && e.y > 0 && (e.elite || e.mid)))) want.push([h]);
      } else if (sk.id === 'wallwalk') {
        if (h.wallSt !== 'out' && (nearDoor >= 4 || g.bossAlive || hpF < 0.6)) want.push([h]);
      } else if (alive >= 6 || g.bossAlive) want.push([h]);
    }
    want.sort((a, b) => (a[0]._lastSk || -99) - (b[0]._lastSk || -99));
    for (const [h, x, y] of want) if (S.castSkill(g, h, x, y)) { h._lastSk = g.t; break; } else if (g.skillQ && g.skillQ.h === h) { h._lastSk = g.t; break; }
  }
  // 한 판 (사람처럼: 카드는 바로 고르고, 총공지는 적이 많거나 보스가 있을 때 쓴다)
  function play(o) {
    const rng = seeded(o.seed);
    const g = o.snap ? S.restoreGame(o.snap, { rng, H: 760 }) : S.createGame({
      H: 760, rng, mode: o.mode || 'stage', stage: o.stage, meta: o.meta || {}, items: o.items || {},
      partner: o.partner, hiddenUnlocked: o.unlocked || [], heroes: o.heroes || (o.team ? ['bangjang', ...o.team] : undefined),
      deck: o.deck, gear: o.gear, join: o.join !== undefined ? o.join : JOIN_MODE, tempo: o.tempo !== undefined ? o.tempo : TEMPO_MODE, hell: !!o.hell, leader: o.leader, conds: o.conds || COND_ARG || (args.includes('--hellnoextra') && o.hell ? D.stageConds(o.stage, false) : undefined), noSoft: o.noSoft || NOSOFT, wtrait: o.wtrait || WTR, stars: o.stars, coll: o.coll,
    });
    g.partner = o.partner;
    if (o.policy) g._policy = o.policy;
    if (o.noSkFor) g._noSk = o.noSkFor;
    if (o.noTypes) g.noTypes = true;
    const pr = seeded(o.seed * 7 + 3);
    const maxT = o.maxT || 900;
    let steps = 0;
    const summons = new Set(); // 소환(성준영)은 퇴근하면 목록에서 빠진다 → 피해 몫을 따로 모은다
    while (!g.over && g.phase !== 'victory' && g.t < maxT) {
      S.step(g, 1 / 60);
      steps++;
      for (const h of g.heroes) if (h.def.summon) summons.add(h);
      if (o.onStep) o.onStep(g); // (focus: 판 중 사건 · 상태 세기)
      if (o.onEvents) o.onEvents(g, g.events);
      if (FOES) for (const e of g.events) if (e.type === 'baseHit' && e.by) { const m = g._doorBy || (g._doorBy = {}); m[e.by] = (m[e.by] || 0) + (e.v || 0); } // (foes: 누가 입구를 쳤나)
      g.events.length = 0;
      // 레벨업 카드는 게임이 안 멈춘다 → 사람처럼 1.5~3초 뒤에 고른다
      if (g.pendingLevels > 0 && g.pickAt === undefined) g.pickAt = g.t + (g.welcomePicks > 0 ? 0 : PICK_DELAY * (0.75 + pr() * 0.5));
      if (g.pendingLevels > 0 && g.t >= g.pickAt) {
        const cards = S.rollCards(g), c = cards[pickCard(g, cards, pr)];
        g._pk = g._pk || {}; { const kk = g.welcomePicks > 0 ? 'welcome' : c.kind; g._pk[kk] = (g._pk[kk] || 0) + 1; } // 고른 카드 종류 (growth 측정용)
        { const key = (x) => x.kind === 'global' || x.kind === 'filler' ? x.id : x.kind; g._off = g._off || []; g._got = g._got || []; for (const x of cards) g._off.push(key(x)); g._got.push(key(c)); } // (카드 고른 비율 · 고르면 이기나: --cardstat)
        S.applyCard(g, c);
        g.pendingLevels--;
        if (g.welcomePicks > 0) g.welcomePicks--;
        g.pickAt = undefined;
      }
      if (g.ult >= D.RULES.ultMax && (g.bossAlive > 0 || S.enemiesLeft(g) >= 10 || g.base.hp / g.base.max < 0.5)) S.useUlt(g);
      if ((o.skills !== undefined ? o.skills : SKILLS) && (steps % (o.skillEvery || SKILL_EVERY)) === 0) aiSkills(g, o.control);
      if (steps % BOARD_EVERY === 0) { const bh = g.heroes.find((h) => h.def.proj === 'board'); if (bh && S.boardCharges(bh) >= 1 && !(bh.bd && bh.bd.st === 'dash')) { const tg = S.boardAutoTarget(g); if (tg) S.setBoardAim(g, tg.x, tg.y); } } // 송바울 (완전 수동): 사람처럼 진상이 많이 줄 선 쪽을 탭
      if (o.stopWave && g.wave >= o.stopWave && g.phase === 'break') break;
    }
    const heroes = {};
    for (const h of g.heroes) if (!h.def.summon) heroes[h.id] = { dmg: h.dmgDone, lv: h.lv, kills: h.kills };
    for (const h of summons) { const o = heroes[h.id] || (heroes[h.id] = { dmg: 0, lv: h.lv, kills: 0 }); o.dmg += h.dmgDone; o.kills += h.kills; }
    return { g, win: g.victory, stars: g.victory ? g.stars : 0, hp: g.base.hp / g.base.max, t: g.t, wave: g.wave, level: g.level, heroes, steps, dmg: g.stats.damage };
  }

  // ── 1) 영웅 혼자 Lv1~5: 같은 적 무리를 60초 동안 때린 피해 (보조 효과는 빼고 순수 피해)
  function curve() {
    console.log('\n■ 영웅 레벨 곡선 — 혼자 60초, 난이도 8 적 무리 상대 DPS (강화 0, 카드 없음)');
    console.log(pad('영웅', 10) + [1, 2, 3, 4, 5].map((l) => pad('Lv' + l, 8)).join('') + ' Lv5/Lv1');
    const ids = ['bangjang', ...PARTNERS];
    for (const id of ids) {
      const row = [];
      for (let lv = 1; lv <= 5; lv++) {
        let tot = 0;
        const N = 4;
        for (let s = 1; s <= N; s++) {
          const g = S.createGame({ H: 760, rng: seeded(s * 31 + lv), heroes: [id], god: true, noWaves: true });
          g.phase = 'test';
          g.diff = 8; g.wave = 8; g.noTypes = true; // (옛 버전은 g.wave 로 난이도) · 상성은 빼고 순수 비교
          g.heroes[0].lv = lv;
          const types = ['yeokko', 'namkko', 'drunk', 'thug', 'mukti', 'yeokko', 'namkko', 'drunk'];
          let k = 0;
          for (let t = 0; t < 60; t += 1 / 60) {
            let alive = 0;
            for (const e of g.enemies) if (!e.dead) alive++;
            while (alive < 22) { const e = S.spawnEnemy(g, types[k++ % types.length]); e.stopY -= g.rng() * 120; alive++; }
            S.step(g, 1 / 60);
            g.events.length = 0;
            g.exp = 0; g.pendingLevels = 0;
          }
          tot += g.heroes[0].dmgDone / 60;
        }
        row.push(tot / N);
      }
      console.log(pad(NAME[id], 10) + row.map((v) => pad(v.toFixed(0), 8)).join('') + ' ×' + (row[4] / row[0]).toFixed(2));
    }
  }

  // 스테이지 s 쯤 도착한 사람의 평균 강화 수준 (캠페인 결과를 보고 잡은 값)
  const MF = opt('mf', 0.45);
  const metaAt = (s) => Math.min(20, Math.round(s * MF));
  const itemsAt = (s) => ({ door: Math.min(10, Math.round(s / 4)), charm: Math.min(10, Math.round(s / 5)), battery: Math.min(10, Math.round(s / 5)), drink: s >= 18 ? 1 : 0 });

  // ── 2) 스테이지 표
  function stages() {
    const N = opt('seeds', 12);
    const list = (process.argv.find((x) => x.startsWith('--list=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    if (!list.length) list.push(3, 5, 8, 10, 13, 15, 18, 20, 23, 25, 28, 30);
    console.log(`\n■ 스테이지별 — 방장 + 동료, 강화 = 스테이지×${MF} (최대 20), 아이템 조금, 시드 ${N}판`);
    console.log(pad('동료', 10) + list.map((s) => pad(D.stageLabel(s), 12)).join(''));
    const all = {};
    for (const p of PARTNERS) {
      const cells = [];
      let dps = 0, dpsN = 0, share = 0;
      for (const s of list) {
        const m = metaAt(s);
        let win = 0, stars = 0, t = 0;
        for (let i = 1; i <= N; i++) {
          const team = s > 10 ? [p, p === 'staff' ? 'gunman' : 'staff'] : [p]; // 2챕터부터 동료 2명 (둘째는 운영진/건전남)
          const r = play({ stage: s, partner: p, team, meta: { bangjang: m, [p]: m, staff: m, gunman: m, gunnyeo: m }, items: itemsAt(s), seed: i * 101 + s, unlocked: [] });
          if (r.win) { win++; stars += r.stars; }
          t += r.t;
          const ph = r.heroes[p];
          if (ph) { dps += ph.dmg / r.t; dpsN++; share += ph.dmg / Math.max(1, r.dmg); }
        }
        cells.push({ s, win: win / N, stars: win ? stars / win : 0, t: t / N });
      }
      all[p] = { cells, dps: dps / dpsN, share: share / dpsN };
      console.log(pad(NAME[p], 10) + cells.map((c) => pad(`${Math.round(c.win * 100)}% ${c.stars.toFixed(1)}★`, 12)).join(''));
    }
    console.log('\n' + pad('동료', 10) + pad('동료 DPS', 10) + pad('피해 몫', 9) + pad('평균 클리어율', 14) + pad('평균 별', 8) + '평균 시간');
    for (const p of PARTNERS) {
      const a = all[p];
      const wr = a.cells.reduce((x, c) => x + c.win, 0) / a.cells.length;
      const st = a.cells.reduce((x, c) => x + c.stars * c.win, 0) / Math.max(0.001, a.cells.reduce((x, c) => x + c.win, 0));
      const tm = a.cells.reduce((x, c) => x + c.t, 0) / a.cells.length;
      console.log(pad(NAME[p], 10) + pad(a.dps.toFixed(0), 10) + pad(Math.round(a.share * 100) + '%', 9) + pad(Math.round(wr * 100) + '%', 14) + pad(st.toFixed(2), 8) + `${Math.floor(tm / 60)}분 ${Math.round(tm % 60)}초`);
    }
    return all;
  }

  // ── 3) 캠페인: 0 코인, 보상으로 강화하면서 앞으로. 동료는 처음부터 고정(히든도 비교용으로 허용)
  function campaign() {
    const maxPlays = opt('plays', 160);
    const seeds = opt('cseeds', 2);
    console.log(`\n■ 캠페인 — 0코인 시작, 보상으로 (방장·동료·문·부적·배터리·드링크) 싼 것부터 강화, 최대 ${maxPlays}판 × ${seeds}회`);
    console.log(pad('동료', 10) + pad('3-10까지 판수', 15) + pad('시간', 7) + pad('도달', 8) + pad('총 별', 7) + pad('첫 별', 7) + pad('1-10', 6) + pad('2-10', 6) + pad('강화(방장/동료)', 16));
    for (const p of PARTNERS) {
      const res = [];
      for (let k = 1; k <= seeds; k++) {
        const prof = { coins: 0, heroes: { bangjang: 0, [p]: 0, staff: 0, gunman: 0 }, items: { door: 0, coupon: 0, battery: 0, charm: 0, drink: 0 }, stages: {} };
        let cur = 1, plays = 0, at10 = 0, at20 = 0, done = 0, fails = 0, time = 0, firstStars = 0, firsts = 0;
        while (plays < maxPlays && cur <= 30) {
          plays++;
          // 막히면 사람처럼 전 스테이지를 한 번 돌아서 코인을 모은다
          const farm = fails > 0 && fails % 2 === 0 && cur > 1;
          const st = farm ? cur - 1 : cur;
          const team = D.partnerSlots(Math.max(0, cur - 1)) > 1 ? [p, p === 'staff' ? 'gunman' : 'staff'] : [p];
          const r = play({ stage: st, partner: p, team, meta: prof.heroes, items: prof.items, seed: plays * 13 + k * 1000, unlocked: [] });
          time += r.t;
          if (farm) {
            if (r.win) prof.coins += D.stageReward(st, r.stars, prof.stages[st] || 0, prof.items.coupon).total;
            fails++;
          } else if (!r.win) fails++;
          else {
            fails = 0;
            if (!prof.stages[cur]) { firstStars += r.stars; firsts++; }
            const prev = prof.stages[cur] || 0;
            prof.coins += D.stageReward(cur, r.stars, prev, prof.items.coupon).total;
            prof.stages[cur] = Math.max(prev, r.stars);
            if (cur === 10 && !at10) at10 = plays;
            if (cur === 20 && !at20) at20 = plays;
            if (cur === 30) { done = plays; cur++; break; }
            // 별 3개 못 받았으면 한 번 더 (보통 사람처럼) — 아니면 다음
            if (r.stars === 3 || prev) cur++;
          }
          // 강화: 가장 싼 것부터
          for (;;) {
            const opts = [];
            for (const h of ['bangjang', p, ...(cur > 10 ? [p === 'staff' ? 'gunman' : 'staff'] : [])]) { const c = prof.heroes[h] < D.META_MAX ? D.metaCost(prof.heroes[h]) : null; if (c !== null) opts.push([c, () => { prof.heroes[h]++; }]); }
            for (const it of ['door', 'charm', 'battery', 'drink', 'coupon']) {
              const c = D.itemCost(it, prof.items[it]);
              if (c !== null) opts.push([it === 'drink' ? c * 0.8 : it === 'coupon' ? c * 1.6 : c * 1.15, () => { prof.items[it]++; }, c]);
            }
            opts.sort((a, b) => a[0] - b[0]);
            const o = opts[0];
            const cost = o && (o[2] || o[0]);
            if (!o || prof.coins < cost) break;
            prof.coins -= cost;
            o[1]();
          }
        }
        const stars = Object.values(prof.stages).reduce((a, b) => a + b, 0);
        res.push({ done, reach: Math.min(30, cur - (done ? 1 : 0)), stars, at10, at20, meta: `${prof.heroes.bangjang}/${prof.heroes[p]}`, hours: time / 3600, fs: firstStars / Math.max(1, firsts) });
      }
      const avg = (f) => res.reduce((a, r) => a + f(r), 0) / res.length;
      const doneTxt = res.every((r) => r.done) ? avg((r) => r.done).toFixed(0) + '판' : res.map((r) => (r.done ? r.done : '✕')).join('/');
      console.log(pad(NAME[p], 10) + pad(doneTxt, 15) + pad(avg((r) => r.hours).toFixed(1) + 'h', 7) + pad(res.map((r) => D.stageLabel(Math.max(1, r.reach))).join(','), 8) + pad(avg((r) => r.stars).toFixed(0), 7)
        + pad(avg((r) => r.fs).toFixed(2), 7) + pad(avg((r) => r.at10).toFixed(0), 6) + pad(avg((r) => r.at20).toFixed(0), 6) + res.map((r) => r.meta).join(' '));
    }
  }

  // ── 초반 곡선 (node scripts/lb-balance.js early): 그 스테이지에 보통 사람이 가진 덱으로 1-1 ~ 2-3 클리어율
  //  강화는 스테이지 따라 조금씩 (s/3) · 동료는 그때 열린 멤버 중 하나씩 번갈아 (김도훈은 1-6 깬 뒤부터)
  function early() {
    // --add=5:-2,6:-3 : 스테이지 난이도(stageAdd)를 바꿔 보고 싶을 때 (파일은 안 바뀜)
    const ov = (process.argv.find((x) => x.startsWith('--add=')) || '').slice(6);
    for (const kv of ov.split(',').filter(Boolean)) { const [k, v] = kv.split(':').map(Number); D.STAGE.stageAdd[k] = v; }
    const only = (process.argv.find((x) => x.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    const seeds = opt('seeds', 24);
    console.log(`■ 초반 곡선 — 스테이지별 클리어율 (${seeds}판 · 카드 ${POLICY})`);
    const rows = [];
    for (let s = 1; s <= 13; s++) {
      if (only.length && !only.includes(s)) continue;
      const lv = Math.min(D.META_MAX, Math.floor(s / 3));
      const pool = ['staff', 'gunman', 'gunnyeo', ...Object.entries(D.HERO_UNLOCK).filter(([, n]) => n < s).map(([id]) => id)];
      let win = 0, hp = 0;
      for (let k = 0; k < seeds; k++) {
        const p = pool[k % pool.length];
        // 덱 4칸: 방장 + 가진 멤버 셋 (새로 연 멤버가 있으면 사람들은 바로 넣어 본다)
        const fresh = pool.slice(3);
        const mates = [...fresh.slice(-1), ...['staff', 'gunman', 'gunnyeo'].filter((x, i) => i !== k % 3)].slice(0, 3);
        const meta = Object.fromEntries(['bangjang', ...pool].map((h) => [h, lv]));
        const r = play({ stage: s, partner: p, deck: [null, mates[0], 'bangjang', mates[1], mates[2], null], meta, seed: s * 1000 + k, unlocked: [] });
        if (r.win) win++;
        hp += r.win ? r.hp : 0;
      }
      rows.push(`${D.stageLabel(s)}	${Math.round((win / seeds) * 100)}%	남은 입구 ${win ? Math.round((hp / win) * 100) : 0}%	(강화 ${lv} · 동료 ${pool.length}명)`);
    }
    console.log(rows.join(String.fromCharCode(10)));
  }
  if (what === 'early') { early(); return; }

  // ── 4) 옛 방식 비교용: 20웨이브 한 판 (모두 강화 5), 동료별 도달 웨이브
  function run20() {
    const N = opt('seeds', 12);
    console.log(`
■ 20웨이브 런 — 방장 + 동료, 강화 전부 5, ${N}판`);
    console.log(pad('동료', 10) + pad('평균 웨이브', 12) + pad('20 클리어', 10) + pad('동료 DPS', 10) + '피해 몫');
    for (const p of PARTNERS) {
      let wv = 0, win = 0, dps = 0, share = 0;
      for (let i = 1; i <= N; i++) {
        const meta = { bangjang: 5, staff: 5, gunman: 5, gunnyeo: 5, eunok: 5, hanna: 5, sunggu: 5, myunghoon: 5 };
        const r = play({ mode: 'endless', partner: p, meta, seed: i * 77, unlocked: [], heroes: ['bangjang', p], stopWave: 21, maxT: 2400 });
        const w = Math.min(20, r.g.stats.wavesCleared);
        wv += w; if (w >= 20) win++;
        const ph = r.heroes[p]; dps += ph.dmg / r.t; share += ph.dmg / Math.max(1, r.dmg);
      }
      console.log(pad(NAME[p], 10) + pad((wv / N).toFixed(1), 12) + pad(Math.round((win / N) * 100) + '%', 10) + pad((dps / N).toFixed(0), 10) + Math.round((share / N) * 100) + '%');
    }
  }

  console.log(`(카드 고르기: ${POLICY})`);
  // ── 5) 상성: 좋은 팀 vs 나쁜 팀, 스킬 씀 vs 안 씀 (어려운 스테이지)
  function matchups() {
    const N = opt('seeds', 10);
    const pool = ['staff', 'gunman', 'gunnyeo', 'dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun'];
    const list = (process.argv.find((x) => x.startsWith('--list=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    if (!list.length) list.push(5, 6, 9, 10, 15, 16, 19, 20, 25, 26, 29, 30);
    console.log(`\n■ 상성 — 일반 동료(운영진·건전남·건전녀·서명훈)로 상성 좋은 팀 vs 나쁜 팀, 강화 = 스테이지×${MF}, ${N}판`);
    console.log(pad('스테이지', 9) + pad('추천', 11) + pad('좋은 팀', 24) + pad('나쁜 팀', 24) + pad('나쁜', 7) + pad('좋은', 7) + pad('좋은+스킬', 10));
    const tot = { good: 0, bad: 0, goodS: 0, n: 0, gs: 0, bs: 0, gss: 0 };
    for (const s of list) {
      const sc = D.attrScores(s);
      const slots = D.partnerSlots(s - 1);
      const combos = [];
      if (slots === 1) for (const a of pool) combos.push([a]);
      else for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) combos.push([pool[i], pool[j]]);
      const val = (c) => c.reduce((x, id) => x + sc[D.HEROES[id].attr], 0);
      combos.sort((a, b) => val(b) - val(a));
      const good = combos[0], bad = combos[combos.length - 1];
      const m = metaAt(s);
      const meta = { bangjang: m, staff: m, gunman: m, gunnyeo: m, myunghoon: m };
      const res = {};
      for (const [k, team, sk] of [['good', good, false], ['bad', bad, false], ['goodS', good, true]]) {
        let w = 0, st = 0;
        for (let i = 1; i <= N; i++) { const r = play({ stage: s, team, partner: team[0], meta, items: itemsAt(s), seed: i * 53 + s, unlocked: [], skills: sk }); if (r.win) { w++; st += r.stars; } }
        res[k] = [w / N, st / N];
      }
      tot.good += res.good[0]; tot.bad += res.bad[0]; tot.goodS += res.goodS[0]; tot.gs += res.good[1]; tot.bs += res.bad[1]; tot.gss += res.goodS[1]; tot.n++;
      const nm = (t) => t.map((id) => NAME[id] + D.ATTRS[D.HEROES[id].attr].name).join('+');
      const pc = (r) => `${Math.round(r[0] * 100)}%`;
      console.log(pad(D.stageLabel(s), 9) + pad(D.recommendAttrs(s).map((a) => D.ATTRS[a].name).join('·'), 11) + pad(nm(good), 24) + pad(nm(bad), 24)
        + pad(pc(res.bad), 7) + pad(pc(res.good), 7) + pad(pc(res.goodS), 10));
    }
    const f = (v) => Math.round((v / tot.n) * 100) + '%';
    const st = (v) => (v / tot.n).toFixed(2) + '★';
    console.log(`평균 클리어율(판당 별): 나쁜 팀 ${f(tot.bad)} (${st(tot.bs)}) · 좋은 팀 ${f(tot.good)} (${st(tot.gs)}) · 좋은 팀+스킬 ${f(tot.goodS)} (${st(tot.gss)})`);
  }

  // ── 6) 타고난 힘: 상성 없이, 동료 1명 + 운영진 대신 아무도 없이 — 영웅끼리 공정한지
  function innate() {
    const N = opt('seeds', 8);
    const list = (process.argv.find((x) => x.startsWith('--list=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    if (!list.length) list.push(8, 12, 16, 19, 23, 27);
    console.log(`
■ 타고난 힘 — 상성 끄고, 방장 + 동료 1명, 강화 = 스테이지×${MF}, 스킬 ${SKILLS ? '씀' : '안 씀'}, ${N}판`);
    console.log(pad('동료', 10) + list.map((s) => pad(D.stageLabel(s), 8)).join('') + pad('평균', 8) + pad('남은 입구', 10) + '피해 몫');
    for (const p of PARTNERS) {
      let tw = 0, thp = 0, tn = 0, sh = 0;
      const cells = [];
      for (const s of list) {
        const m = metaAt(s);
        let w = 0;
        for (let i = 1; i <= N; i++) {
          const r = play({ stage: s, team: [p], partner: p, meta: { bangjang: m, [p]: m, staff: m, gunman: m, gunnyeo: m }, items: itemsAt(s), seed: i * 41 + s, unlocked: [], noTypes: true });
          if (r.win) w++; thp += r.win ? r.hp : 0; tn++;
          sh += (r.heroes[p] ? r.heroes[p].dmg : 0) / Math.max(1, r.dmg);
        }
        tw += w; cells.push(Math.round((w / N) * 100) + '%');
      }
      console.log(pad(NAME[p], 10) + cells.map((c) => pad(c, 8)).join('') + pad(Math.round((tw / tn) * 100) + '%', 8) + pad(Math.round((thp / Math.max(1, tw)) * 100) + '%', 10) + Math.round((sh / tn) * 100) + '%');
    }
  }

  function placeDeck(ids) {
    const out = new Array(6).fill(null), order = [2, 3, 1, 4, 0, 5];
    const center = (id) => (['cone', 'wave', 'dash', 'bullet', 'cane', 'crown', 'shout'].includes(D.HEROES[id].proj) ? 0 : 1); // (막차 버스 · 고함도 가운데 줄이 낫다)
    ids.slice().sort((a, b) => center(a) - center(b)).forEach((id, i) => { out[order[i]] = id; });
    return out;
  }
  // 그 스테이지쯤 사람이 끼고 있을 장비 (멤버마다)
  const gearAt = (s, ids) => { const c = D.chapterOf(s); const st = { atk: 0.03 * c, spd: 0.02 * c, crit: c >= 2 ? 0.02 : 0, hp: 0.01 * c }; return Object.fromEntries(ids.map((id) => [id, st])); };
  // ── 7) 최종 표: 챕터별 클리어율 (팀 구성 · 스킬), 평균 시간, 스테이지 곡선
  function final() {
    const N = opt('seeds', 3);
    const pool = (process.argv.find((x) => x.startsWith('--pool=')) || '').slice(7).split(',').filter(Boolean);
    if (!pool.length) pool.push('staff', 'gunman', 'gunnyeo', 'dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun', 'eunok', 'hanna', 'sunggu');
    // 덱 칸: 1~4장 4칸 · 5장 5칸(5번째 칸 삼) · 6장 6칸
    const slotsAt = (s) => Math.min(6, Math.max(4, D.chapterOf(s) - 1));
    const teamFor = (s, best) => {
      const sc = D.attrScores(s);
      const n = slotsAt(s);
      const avail = ['bangjang', ...pool].filter((id) => !D.HERO_UNLOCK[id] || D.HERO_UNLOCK[id] < s);
      if (best) return D.recommendTeam(s, avail, n);
      let worst = null, wv = 1e9;
      const val = (c) => c.reduce((x, id) => x + sc[D.HEROES[id].attr], 0);
      const pick = (st, cur) => { if (cur.length === Math.min(n, avail.length)) { const v = val(cur); if (v < wv) { wv = v; worst = cur.slice(); } return; } for (let i = st; i < avail.length; i++) { cur.push(avail[i]); pick(i + 1, cur); cur.pop(); } };
      pick(0, []);
      return worst;
    };
    const kinds = [['좋은 팀+스킬', true, true], ['좋은 팀', true, false], ['나쁜 팀', false, false]].slice(0, process.argv.includes('--onlygood') ? 1 : 3);
    const ht = (process.argv.find((x) => x.startsWith('--hptune=')) || '').slice(9);
    if (ht) D.STAGE.hpTune = ht.split(',').map(Number);
    const per = {}; const curve = []; const picks = {}; let teams = 0;
    const only = (process.argv.find((x) => x.startsWith('--list=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    for (let s = 1; s <= D.STAGE_COUNT; s++) {
      if (only.length && !only.includes(s)) continue;
      const m = metaAt(s);
      const meta = Object.fromEntries(Object.keys(D.HEROES).map((id) => [id, m]));
      const row = [];
      for (const [k, best, sk] of kinds) {
        const team = teamFor(s, best);
        if (best && sk) { teams++; for (const id of team) picks[id] = (picks[id] || 0) + 1; }
        if (process.argv.includes('--teams')) console.log(D.stageLabel(s), k, team.join('+'));
        let w = 0, st = 0, t = 0, hpSum = 0;
        let pf = 0;
        for (let i = 1; i <= N; i++) { const r = play({ stage: s, deck: placeDeck(team), partner: team[0], meta, gear: gearAt(s, team), items: itemsAt(s), seed: i * 97 + s, unlocked: [], skills: sk }); if (r.win) { w++; st += r.stars; t += r.t; hpSum += r.hp; if (!r.g.baseHit) pf++; } }
        const c = D.chapterOf(s);
        const P = (per[k + c] = per[k + c] || { w: 0, n: 0, st: 0, t: 0, tw: 0, hp: 0 });
        P.w += w; P.n += N; P.st += st; P.t += t; P.tw += w; P.hp += hpSum;
        row.push(Math.round((w / N) * 100));
      }
      curve.push(`${D.stageLabel(s)}:${row.join('/')}`);
    }
    console.log(`
■ 최종 — 강화 = 스테이지×${MF} (+아이템 조금), 스테이지마다 ${N}판, 카드는 ${POLICY}`);
    const CH = Array.from({ length: D.CHAPTERS.length }, (_, i) => i + 1);
    console.log(pad('팀', 16) + CH.map((c) => pad(`${c}장(별)`, 14)).join('') + '평균 시간');
    for (const [k] of kinds) {
      let tt = 0, tw = 0;
      const cells = CH.map((c) => { const P = per[k + c]; if (!P) return pad('-', 14); tt += P.t; tw += P.tw; return pad(`${Math.round((P.w / P.n) * 100)}% (${(P.st / Math.max(1, P.w)).toFixed(1)}★)`, 14); });
      console.log(pad(k, 16) + cells.join('') + `${Math.floor(tt / tw / 60)}분 ${Math.round((tt / tw) % 60)}초`);
    }
    const jp = (process.argv.find((x) => x.startsWith('--json=')) || '').slice(7);
    if (jp) {
      const TG = [80, 65, 55, 45, 30, 20, 15];
      const out = { chapters: CH.map((c) => ({ chapter: c, target: TG[c - 1], hpTune: D.STAGE.hpTune[c - 1],
        ...Object.fromEntries(kinds.map(([k]) => { const P = per[k + c] || { w: 0, n: 1, st: 0, hp: 0 }; return [k, { clear: Math.round((P.w / P.n) * 100), stars: +(P.st / Math.max(1, P.w)).toFixed(2), hpLeft: Math.round((P.hp / Math.max(1, P.w)) * 100) }]; })) })),
        pickRate: Object.fromEntries(Object.entries(picks).map(([id, n]) => [id, Math.round((n / Math.max(1, teams)) * 100)])), curve };
      require('fs').writeFileSync(jp, JSON.stringify(out, null, 1));
    }
    console.log('스테이지별 클리어율 % (좋은+스킬/좋은/나쁜):');
    for (let i = 0; i < curve.length; i += 10) console.log('  ' + curve.slice(i, i + 10).join('  '));
  }

  // ── 8) 스테이지별 맞춤 (--calib): 스테이지마다 난이도 가산(stageAdd)을 이분 탐색해서 목표 클리어율에 맞춘다
  //  목표: 챕터 목표 + 챕터 앞쪽은 조금 쉽게 · 보스 스테이지는 조금 어렵게 → 들쭉날쭉하지 않은 곡선
  function calib() {
    const N = opt('seeds', 8), IT = opt('iters', 4);
    const TG = [80, 65, 55, 45, 30, 20, 15];
    const ht = (process.argv.find((x) => x.startsWith('--hptune=')) || '').slice(9);
    if (ht) D.STAGE.hpTune = ht.split(',').map(Number);
    const pool = ['staff', 'gunman', 'gunnyeo', 'dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun', 'eunok', 'hanna', 'sunggu'];
    const slotsAt = (s) => Math.min(6, Math.max(4, D.chapterOf(s) - 1));
    const out = {};
    const only = (process.argv.find((x) => x.startsWith('--list=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    for (let s = 3; s <= D.STAGE_COUNT; s++) {
      if (only.length && !only.includes(s)) continue;
      const n = D.stageNo(s), c = D.chapterOf(s);
      const target = TG[c - 1] + (5 - n) * 1.5 - ([5, 10].includes(n) ? 5 : 0);
      const m = metaAt(s);
      const meta = Object.fromEntries(Object.keys(D.HEROES).map((id) => [id, m]));
      const avail = ['bangjang', ...pool].filter((id) => !D.HERO_UNLOCK[id] || D.HERO_UNLOCK[id] < s);
      const team = D.recommendTeam(s, avail, slotsAt(s));
      const base = D.STAGE.stageAdd[s] || 0;
      const rate = (add) => {
        D.STAGE.stageAdd[s] = base + add;
        let w = 0;
        for (let i = 1; i <= N; i++) if (play({ stage: s, deck: placeDeck(team), partner: team[0], meta, gear: gearAt(s, team), items: itemsAt(s), seed: i * 131 + s * 7, unlocked: [], skills: true }).win) w++;
        return (w / N) * 100;
      };
      const RG = opt('range', 4);
      let lo = -RG, hi = RG, best = 0, bestErr = 1e9, r0 = rate(0);
      if (Math.abs(r0 - target) < 100 / N) { best = 0; bestErr = Math.abs(r0 - target); }
      else {
        for (let k = 0; k < IT; k++) {
          const mid = (lo + hi) / 2;
          const r = rate(mid);
          if (Math.abs(r - target) < bestErr) { bestErr = Math.abs(r - target); best = mid; }
          if (r > target) lo = mid; else hi = mid;
        }
      }
      D.STAGE.stageAdd[s] = base + best;
      out[s] = +(base + best).toFixed(2);
      console.log(`${D.stageLabel(s)} 목표 ${target.toFixed(0)}% · 처음 ${r0.toFixed(0)}% → 가산 ${out[s]} (오차 ${bestErr.toFixed(0)})`);
    }
    console.log('stageAdd: ' + JSON.stringify(Object.fromEntries(Object.entries(out).filter(([, v]) => v !== 0))));
  }
  // ── 9) 7장 스키장 (node scripts/lb-balance.js ch7 [--seeds=N] [--list=61,65] [--hell]) — 실제 게임처럼 합류 · 템포 · 스킬 · 6칸 덱
  //  덱 성향별 클리어율: 한 명만 키운 덱 · 역할을 갖춘 T3/T4 덱(컨트롤 있음/없음) · 키운 LEGEND 포함 덱
  function ch7(chap = 7) {
    const N = opt('seeds', 8);
    const list = (process.argv.find((x) => x.startsWith('--list=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    if (!list.length) for (let s = chap * 10 - 9; s <= chap * 10; s++) list.push(s);
    const hell = args.includes('--hell');
    const only = (process.argv.find((x) => x.startsWith('--prof=')) || '').slice(7).split(',').filter(Boolean);
    const lo = (ids, m, extra = {}) => Object.assign(Object.fromEntries(ids.map((id) => [id, m])), extra);
    const PROF = [
      ['한 명 몰빵(T4 아라 20)', ['ara', 'bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon'], lo(['bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon'], 8, { ara: 20 }), true],
      ['한 명 몰빵(LEGEND 20)', ['hochan', 'bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon'], lo(['bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon'], 8, { hochan: 20 }), true],
      ['T3·T4 역할 덱 (컨트롤 X)', ['donghan', 'ara', 'gunnyeo', 'sunggu', 'staff', 'hyungyeong'], lo(['ara', 'gunnyeo', 'sunggu', 'staff', 'donghan', 'hyungyeong'], 15), false],
      ['T3·T4 역할 덱', ['donghan', 'ara', 'gunnyeo', 'sunggu', 'staff', 'hyungyeong'], lo(['ara', 'gunnyeo', 'sunggu', 'staff', 'donghan', 'hyungyeong'], 15), true],
      ['역할 덱 + LEGEND 이호찬', ['donghan', 'hochan', 'ara', 'gunnyeo', 'sunggu', 'staff'], lo(['ara', 'gunnyeo', 'sunggu', 'donghan', 'staff'], 15, { hochan: 20 }), true],
      ['역할 덱 + LEGEND 강병화', ['donghan', 'byunghwa', 'ara', 'gunnyeo', 'sunggu', 'staff'], lo(['ara', 'gunnyeo', 'sunggu', 'staff', 'donghan'], 15, { byunghwa: 20 }), true],
      ['역할 덱 + LEGEND 둘', ['donghan', 'hochan', 'byunghwa', 'gunnyeo', 'sunggu', 'staff'], lo(['gunnyeo', 'sunggu', 'donghan', 'staff'], 15, { hochan: 20, byunghwa: 20 }), true],
      ['역할 덱 강화 20 (헬용)', ['donghan', 'ara', 'gunnyeo', 'sunggu', 'staff', 'hyungyeong'], lo(['ara', 'gunnyeo', 'sunggu', 'staff', 'donghan', 'hyungyeong'], 20), true],
      ['역할+LEGEND 강화 20 (헬용)', ['donghan', 'byunghwa', 'ara', 'gunnyeo', 'sunggu', 'staff'], lo(['ara', 'gunnyeo', 'sunggu', 'staff', 'donghan', 'byunghwa'], 20), true],
      ['T1·T2만 (강화 15)', ['dohoon', 'bangjang', 'staff', 'gunman', 'gunnyeo', 'eunok'], lo(['dohoon', 'bangjang', 'staff', 'gunman', 'gunnyeo', 'eunok'], 15), true],
      ['역할 덱 + 임수빈 (8장)', ['donghan', 'ara', 'gunnyeo', 'sunggu', 'staff', 'subin'], lo(['ara', 'gunnyeo', 'sunggu', 'staff', 'donghan', 'subin'], 15), true],
    ].filter((p, i) => !only.length || only.includes(String(i)));
    const items = { door: 12, charm: 12, battery: 12, drink: 3, coupon: 10, slot5: 1, slot6: 1 };
    console.log(`
■ ${chap}장${hell ? ' (헬)' : ''} — 합류 · 템포 · 스킬 자동 · ${N}판씩`);
    console.log(pad('덱', 26) + list.map((s) => pad(D.stageLabel(s), 7)).join('') + '평균');
    const out = {};
    for (const [name, ids, meta, control] of PROF) {
      const cells = []; let tw = 0, tn = 0; const lossW = {}, ava = [0, 0], share = {};
      for (const s of list) {
        let w = 0;
        for (let i = 1; i <= N; i++) {
          const r = play({ stage: s, deck: placeDeck(ids), partner: ids[0], leader: ids[0], meta, gear: gearAt(s, ids), items, seed: i * 173 + s * 11 + opt('seedoff', 0), unlocked: [], skills: true, control, join: true, tempo: true, hell });
          if (r.win) w++; else lossW[r.wave] = (lossW[r.wave] || 0) + 1;
          ava[0] += r.g.stats.avaHit || 0; ava[1] += r.g.stats.avaStop || 0; ava[2] = (ava[2] || 0) + (r.g.stats.envStolen || 0); ava[3] = (ava[3] || 0) + (r.g.stats.speechCut || 0); ava[4] = (ava[4] || 0) + (r.g.stats.speechFull || 0);
          for (const [id, v] of Object.entries(r.heroes)) share[id] = (share[id] || 0) + v.dmg / Math.max(1, r.dmg) / (N * list.length);
        }
        cells.push(Math.round((w / N) * 100)); tw += w; tn += N;
      }
      out[name] = cells;
      console.log(pad(name, 26) + cells.map((c) => pad(c + '%', 7)).join('') + Math.round((tw / tn) * 100) + '%' + (chap === 8 ? `  도둑 놓침 ${(ava[2] / tn).toFixed(1)}/판 · 축사 끊음/다 들음 ${ava[3]}/${ava[4]}` : '') + (args.includes('--why') ? `  진 웨이브 ${JSON.stringify(lossW)} · 눈사태 맞음/끊음 ${ava[0]}/${ava[1]} · 피해 몫 ${Object.entries(share).map(([k, v]) => k + ' ' + Math.round(v * 100)).join(' ')}` : ''));
    }
    return out;
  }
  // 7장 스테이지별 맞춤: 역할 덱(컨트롤 있음)으로 stageAdd 를 이분 탐색 (node scripts/lb-balance.js ch7calib --list=64 --target=60)
  function ch7calib() {
    const N = opt('seeds', 8), IT = opt('iters', 4), RG = opt('range', 4);
    const TG = { 61: 72, 62: 68, 63: 64, 64: 62, 65: 55, 66: 60, 67: 58, 68: 56, 69: 54, 70: 46, 71: 70, 72: 66, 73: 62, 74: 60, 75: 52, 76: 58, 77: 56, 78: 54, 79: 52, 80: 44 }; // (8장: 7장보다 조금씩 낮게)
    const list = (process.argv.find((x) => x.startsWith('--list=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    const ids = ['donghan', 'ara', 'gunnyeo', 'sunggu', 'staff', 'hyungyeong'];
    const meta = Object.fromEntries(ids.map((id) => [id, 15]));
    const items = { door: 12, charm: 12, battery: 12, drink: 3, coupon: 10, slot5: 1, slot6: 1 };
    for (const s of list) {
      const target = opt('target', TG[s] || 60);
      const base = D.STAGE.stageAdd[s] || 0;
      const rate = (add) => { D.STAGE.stageAdd[s] = base + add; let w = 0; for (let i = 1; i <= N; i++) if (play({ stage: s, deck: placeDeck(ids), leader: ids[0], meta, gear: gearAt(s, ids), items, seed: i * 173 + s * 11, unlocked: [], skills: true, control: true, join: true, tempo: true }).win) w++; return (w / N) * 100; };
      let lo = -RG, hi = RG, best = 0, bestErr = 1e9;
      const r0 = rate(0); bestErr = Math.abs(r0 - target);
      if (bestErr >= 100 / N) for (let k = 0; k < IT; k++) { const mid = (lo + hi) / 2; const r = rate(mid); if (Math.abs(r - target) < bestErr) { bestErr = Math.abs(r - target); best = mid; } if (r > target) lo = mid; else hi = mid; }
      console.log(`${s} 목표 ${target}% · 처음 ${r0.toFixed(0)}% → 가산 ${+(base + best).toFixed(2)} (오차 ${bestErr.toFixed(0)})`);
    }
  }
  // ── 10) 덱 구성 (node scripts/lb-balance.js deck [--seeds=N] [--ch=2,3,4,5,6] [--nos=4,6,8,9] [--value] [--hell] [--meta=6])
  //  실제 게임처럼 합류 · 템포 · 스킬 자동 · 같은 강화 총량으로
  //   (a) 딜러만 vs (b) 딜러 + 서포터 + 유틸 · (c) --value: 한 명씩 뺐을 때 클리어율이 얼마나 떨어지나 (= 그 멤버 가치)
  // 가치 측정용 '아무것도 안 하는 멤버' (운영진 모습 · 피해 0 · 스킬 안 씀 · 경고 안 쌓임)
  if (!D.HEROES.zz) {
    const st = D.HEROES.staff;
    D.HEROES.zz = Object.assign({}, st, { id: 'zz', name: '빈자리', dmg: 0.0001, slow: 0, warn: Object.assign({}, st.warn, { n: 1e9 }), skill: Object.assign({}, st.skill, { cd: 1e9 }) });
    D.HERO_TIER.zz = 1;
  }
  const DECKS = {
    // 장: [칸 수, 딜러만, 균형] — 균형 = 같은 딜러 핵심 + 마지막 두 칸을 같은 등급의 서포터 · 유틸로 (건전남 T1 ↔ 건전녀/운영진 T1 · 강성구/여지원/이한나 T3 ↔ 정원식 T3 · 김도훈/홍정민 T2)
    1: [4, ['gunman', 'bangjang', 'eunok', 'staff'], ['gunman', 'dohoon', 'gunnyeo', 'staff']],
    2: [4, ['gunman', 'hanna', 'myunghoon', 'eunok'], ['gunman', 'hanna', 'dohoon', 'staff']],
    3: [5, ['donghan', 'hanna', 'youngjun', 'gunman', 'sunggu'], ['donghan', 'hanna', 'youngjun', 'gunnyeo', 'wonsik']],
    4: [5, ['ara', 'donghan', 'youngjun', 'hanna', 'gunman'], ['ara', 'donghan', 'youngjun', 'jungmin', 'staff']],
    5: [6, ['ara', 'donghan', 'youngjun', 'hanna', 'gunman', 'jiwon'], ['ara', 'donghan', 'youngjun', 'hanna', 'gunnyeo', 'wonsik']],
    6: [6, ['ara', 'donghan', 'youngjun', 'hanna', 'gunman', 'jiwon'], ['ara', 'donghan', 'youngjun', 'hanna', 'dohoon', 'wonsik']],
  };
  const REC = [4, 7, 10, 12, 14, 16, 18, 20];
  // 기준 플레이어 (그 장을 처음 도전하는 보통 사람) — stagecalib · wtrait 기준
  //  강화 = 장 권장 + REF_PLUS (권장 넘는 만큼은 절반만 들어가서 실제로는 권장 +1) · 예전 +6 은 권장보다 6 단계 더 키우고 첫 도전하는 셈이라 너무 셌다
  //  ★ · 도감 수집 보너스가 생겨서 기준에도 넣는다 (덱 앞 두 명 = 주력 ★, 나머지는 한 단계 아래) · --bare : 예전처럼 ★ · 도감 없이
  const REF_PLUS = 2;
  const REF_STAR = [1, 1, 1, 2, 2, 2, 2, 3];
  const REF_COLL = [[0.01, 0.01, 0.01], [0.01, 0.01, 0.01], [0.02, 0.02, 0.02], [0.02, 0.03, 0.02], [0.03, 0.03, 0.03], [0.03, 0.04, 0.03], [0.04, 0.05, 0.04], [0.04, 0.05, 0.04]]; // 공격 · 입구 · 경험치
  const BARE = args.includes('--bare');
  const refOf = (s, ids) => { if (BARE) return {}; const c = D.chapterOf(s), st = REF_STAR[c - 1], [atk, hp, exp] = REF_COLL[c - 1]; return { stars: Object.fromEntries(ids.map((id, i) => [id, i < 2 ? st : Math.max(1, st - 1)])), coll: { atk, hp, exp } }; };
  const listArg = (k, d) => ((process.argv.find((x) => x.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d).split(',').filter(Boolean);
  const MISDUMP = args.includes('--misdump') ? {} : null; // 미션 숫자 분포 (이긴 판) — 미션 기준값 맞출 때
  function deckRun(ids, s, meta, N, hell, extra = {}) {
    let w = 0, st3 = 0, pf = 0, hp = 0, mis = 0;
    const share = {};
    const contrib = { repair: 0, prevent: 0, buff: 0 };
    for (let i = 1; i <= N; i++) {
      const r = play({ stage: s, deck: placeDeck(ids), partner: ids[0], leader: ids[0], meta, gear: gearAt(s, ids), items: itemsAt(Math.round(s * 1.3)), seed: i * 173 + s * 11 + opt('seedoff', 0), unlocked: [], skills: true, control: true, join: true, tempo: true, hell, ...refOf(s, ids), ...extra });
      if (r.win) { w++; hp += r.hp; if (r.stars >= 3) st3++; if (!r.g.baseHit) pf++; if (r.g.mission && r.g.mission.ok) mis++; }
      if (r.win && r.g.mission && MISDUMP) { const m = r.g.mission, cs = r.g.cstat; const v = m.stat === 'found' ? (cs.hidden ? cs.found / cs.hidden : 1) : m.stat === 'combo' ? r.g.stats.maxCombo : cs[m.stat]; const key = `${D.chapterOf(s)}장 ${m.id}${extra.tag || ''}`; (MISDUMP[key] || (MISDUMP[key] = [])).push(v); }
      const tc = r.g.stats.team || {};
      contrib.repair += (tc.repair || 0) / N; contrib.prevent += (tc.prevent || 0) / N; contrib.buff += (tc.buff || 0) / N;
      for (const [id, v] of Object.entries(r.heroes)) share[id] = (share[id] || 0) + v.dmg / Math.max(1, r.dmg) / N;
    }
    return { w: w / N, st3: st3 / N, pf: pf / N, hp: w ? hp / w : 0, mis: mis / N, share, contrib };
  }
  // 균형 덱 (스테이지마다): 딜러만 덱의 앞쪽 딜러 핵심(칸-2) + 그 스테이지 조건에 맞는 서포터 · 유틸 둘
  //  기절 예고 → 건전녀(해제 · 면역) · 문 돌격 → 김도훈(수리 · 범위) · 보호막 → 운영진(깨기) · 은신 · 철갑 → 건전남(찾기 · 방어 무시) · 떼거리 → 김도훈(범위 · 회복) · 모자라면 건전녀 → 김도훈 → 정원식
  const COUNTER_PICK = { cc: 'gunnyeo', rush: 'dohoon', shield: 'staff', stealth: 'gunman', swarm: 'dohoon', armor: 'gunman' };
  for (const kv of listArg('pick', '')) { const [k, v] = kv.split(':'); COUNTER_PICK[k] = v; } // --pick=rush:wonsik (측정용)
  function balFor(c, s, hell) {
    const [n, dps] = DECKS[c];
    const core = dps.slice(0, n - 2), add = [];
    for (const cd of (COND_ARG || DC.stageConds(s, hell))) { const id = COUNTER_PICK[cd]; if (id && !add.includes(id) && !core.includes(id) && add.length < 2) add.push(id); }
    for (const id of ['gunnyeo', 'dohoon', 'wonsik']) if (add.length < 2 && !add.includes(id)) add.push(id);
    // (10/09 멤버 획득 규정) 스토리 합류 멤버는 그 스테이지를 깨야 쓸 수 있다 → 아직 없는 멤버는 그때 있는 멤버로 바꿔서
    const ok = (id) => !D.HERO_UNLOCK || !D.HERO_UNLOCK[id] || D.HERO_UNLOCK[id] < s, deck = [...core, ...add];
    const alt = ['jungmin', 'ingyu', 'gunnyeo', 'staff', 'bangjang', 'gunman', 'eunok', 'sanghwa', 'myunghoon', 'hanna', 'wonsik'];
    const out = [];
    for (const id of deck) { if (ok(id) && !out.includes(id)) out.push(id); else out.push(alt.find((x) => ok(x) && !out.includes(x) && !deck.includes(x)) || id); }
    return out;
  }
  function deck() {
    const N = opt('seeds', 6);
    const hell = args.includes('--hell');
    const chs = listArg('ch', '2,3,4,5,6').map(Number);
    const nos = listArg('nos', '4,6,8,9').map(Number);
    const plus = opt('meta', 6);
    const kinds = [['a', '딜러만', (c) => DECKS[c][1]], ['b', '균형', (c, s) => balFor(c, s, hell)]];
    if (args.includes('--fixed')) kinds.push(['f', '균형고정', (c) => DECKS[c][2]]);
    console.log(`
■ 덱 구성${hell ? ' (헬)' : ''} — 합류 · 템포 · 스킬 자동 · 강화 = 장 권장 + ${plus} (모든 덱 같은 총량) · ${N}판씩 · 스테이지 ${nos.join(',')}번`);
    console.log('  균형 = 딜러만 덱 앞쪽 딜러 + 그 스테이지 조건에 맞는 서포터 · 유틸 2명');
    console.log(pad('장', 5) + pad('덱', 10) + pad('클리어', 8) + pad('★★★', 7) + pad('퍼펙트', 8) + pad('남은 입구', 10) + pad('미션', 6) + '팀 기여(수리/막음/버프 피해) · 피해 몫%');
    const tot = {};
    const pc = (v) => Math.round(v * 100) + '%';
    const valueOn = args.some((x) => x === '--value' || x.startsWith('--value='));
    const vk = (process.argv.find((x) => x.startsWith('--value=')) || '').slice(8);
    const valAll = {};
    for (const c of chs) {
      const m = REC[c - 1] + plus;
      for (const [k, label, pick] of kinds) {
        const agg = { w: 0, st3: 0, pf: 0, hp: 0, mis: 0, share: {}, contrib: { repair: 0, prevent: 0, buff: 0 } };
        const val = {};
        for (const no of nos) {
          const s = (c - 1) * 10 + no, ids = pick(c, s);
          const meta = Object.fromEntries(ids.map((id) => [id, m]));
          const r = deckRun(ids, s, meta, N, hell, { tag: ' ' + k });
          for (const f of ['w', 'st3', 'pf', 'hp', 'mis']) agg[f] += r[f] / nos.length;
          for (const f in r.contrib) agg.contrib[f] += r.contrib[f] / nos.length;
          for (const [id, v] of Object.entries(r.share)) agg.share[id] = (agg.share[id] || 0) + v / nos.length;
          if (valueOn && (!vk || vk === k)) {
            // 한 명씩 '아무것도 안 하는 멤버'(zz)로 바꿔서 떨어진 클리어율 · ★★★ = 그 멤버 가치 (합류 카드 · 레벨업 몰아주기는 그대로)
            for (const x of ids) {
              const q = deckRun(ids.map((y) => (y === x ? 'zz' : y)), s, Object.assign({}, meta, { zz: m }), N, hell);
              const v0 = val[x] || (val[x] = [0, 0, 0]); v0[0] += r.w - q.w; v0[1] += r.st3 - q.st3; v0[2]++;
              const va = valAll[x] || (valAll[x] = [0, 0, 0]); va[0] += r.w - q.w; va[1] += r.st3 - q.st3; va[2]++;
            }
          }
        }
        const T = tot[k] || (tot[k] = [0, 0, 0]); T[0] += agg.w; T[1] += agg.st3; T[2]++;
        console.log(pad(c + '장', 5) + pad(label, 10) + pad(pc(agg.w), 8) + pad(pc(agg.st3), 7) + pad(pc(agg.pf), 8) + pad(pc(agg.hp), 10) + pad(pc(agg.mis), 6)
          + `${Math.round(agg.contrib.repair)}/${Math.round(agg.contrib.prevent)}/${Math.round(agg.contrib.buff)} · ` + Object.entries(agg.share).sort((x, y) => y[1] - x[1]).map(([id, v]) => `${NAME[id] || id} ${Math.round(v * 100)}`).join(' '));
        if (Object.keys(val).length) console.log(pad('', 15) + '가치 (zz 로 바꿨을 때 클리어/★★★ 하락 %p): ' + Object.entries(val).map(([id, v]) => `${NAME[id] || id} ${Math.round((v[0] / v[2]) * 100)}/${Math.round((v[1] / v[2]) * 100)}`).join(' · '));
      }
    }
    if (MISDUMP) { const q = (arr, f) => { const v = arr.slice().sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.floor(f * v.length))]; }; for (const [k, arr] of Object.entries(MISDUMP).sort()) console.log(`  미션 ${k}: n=${arr.length} 25%=${(+q(arr, 0.25)).toFixed(2)} 50%=${(+q(arr, 0.5)).toFixed(2)} 75%=${(+q(arr, 0.75)).toFixed(2)}`); }
    console.log('평균: ' + kinds.map(([k, label]) => `${label} 클리어 ${pc(tot[k][0] / tot[k][2])} ★★★ ${pc(tot[k][1] / tot[k][2])}`).join(' · '));
    if (Object.keys(valAll).length) {
      const SUP = ['gunnyeo', 'dohoon', 'jungmin', 'wonsik', 'staff', 'bangjang', 'byunghwa', 'ingyu', 'jeongseob'];
      const rows = Object.entries(valAll).map(([id, v]) => [id, v[0] / v[2], v[1] / v[2], v[2]]).sort((x, y) => y[1] + y[2] - x[1] - x[2]);
      console.log('멤버 가치 (모든 스테이지 평균 · 클리어/★★★ %p · 판 묶음 수): ' + rows.map(([id, w, st, n]) => `${SUP.includes(id) ? '[서포터]' : ''}${NAME[id] || id} ${Math.round(w * 100)}/${Math.round(st * 100)}(${n})`).join(' · '));
      const avg = (f) => { const r = rows.filter(f); return r.length ? r.reduce((a, x) => a + x[1] + x[2], 0) / r.length / 2 : 0; };
      console.log(`서포터 평균 ${Math.round(avg((r) => SUP.includes(r[0])) * 100)}%p · 딜러 평균 ${Math.round(avg((r) => !SUP.includes(r[0])) * 100)}%p (클리어 · ★★★ 평균)`);
    }
  }
  // ── 11) 한 속성 덱 (node scripts/lb-balance.js attr [--seeds=N] [--notypes]) — 속성 하나로만 짠 덱의 장별 클리어율
  function attrDecks() {
    const N = opt('seeds', 4);
    const noT = args.includes('--notypes');
    const chs = listArg('ch', '2,3,4,5,6').map(Number);
    const nos = listArg('nos', '3,6,8').map(Number);
    const POOL = { talk: ['myunghoon', 'staff', 'bangjang', 'jiwon', 'soyoung', 'hochan'], power: ['gunman', 'ingyu', 'sunggu', 'hyungyeong', 'sanghwa', 'wonsik'], charm: ['hanna', 'donghan', 'gunnyeo', 'baul', 'jieun', 'junseo'], booze: ['youngjun', 'eunok', 'dohoon', 'ara', 'jungmin', 'jeongseob'] };
    console.log(`\n■ 한 속성 덱 — 상성 ${noT ? '끔' : '켬'} · 합류 · 템포 · 스킬 · ${N}판씩 · 스테이지 ${nos.join(',')}번`);
    console.log(pad('속성', 8) + chs.map((c) => pad(c + '장', 7)).join('') + '평균');
    for (const a of Object.keys(POOL)) {
      const cells = []; let tw = 0;
      for (const c of chs) {
        const ids = POOL[a].slice(0, DECKS[c][0]);
        const meta = Object.fromEntries(ids.map((id) => [id, REC[c - 1] + opt('meta', 3)]));
        let w = 0;
        for (const n of nos) w += deckRun(ids, (c - 1) * 10 + n, meta, N, false, { noTypes: noT }).w / nos.length;
        cells.push(Math.round(w * 100)); tw += w;
      }
      console.log(pad(D.ATTRS[a].name, 8) + cells.map((v) => pad(v + '%', 7)).join('') + Math.round((tw / chs.length) * 100) + '%');
    }
  }
  // ── 12) 한 판씩 자세히 (node scripts/lb-balance.js diag --list=56 --deck=a|b [--seeds=N] [--meta=6])
  function diag() {
    const N = opt('seeds', 4), plus = opt('meta', 6);
    const k = (process.argv.find((x) => x.startsWith('--deck=')) || '--deck=b').slice(7);
    for (const s of listArg('list', '56').map(Number)) {
      const c = D.chapterOf(s), ids = k === 'a' ? DECKS[c][1] : k === 'b' ? DECKS[c][2] : k.split('+');
      const meta = Object.fromEntries(ids.map((id) => [id, REC[c - 1] + plus]));
      console.log(`\n${D.stageLabel(s)} ${D.stageName(s)} · 조건 ${(COND_ARG || (D.stageConds ? D.stageConds(s) : [])).join(',') || '-'} · 미션 ${((D.stageMission && D.stageMission(s)) || {}).text || '-'} · 덱 ${ids.join('+')}`);
      for (let i = 1; i <= N; i++) {
        const r = play({ stage: s, deck: placeDeck(ids), partner: ids[0], leader: ids[0], meta, gear: gearAt(s, ids), items: itemsAt(Math.round(s * 1.3)), seed: i * 173 + s * 11, unlocked: [], skills: true, control: true, join: true, tempo: true, hell: args.includes('--hell') });
        const cs = r.g.cstat || { leak: 0, shieldLeak: 0, armorLeak: 0, found: 0, hidden: 0, ccSec: 0, multi: 0 }, T = r.g.stats.teamBy || {};
        console.log(`  ${r.win ? '승' : '패'} W${r.wave} 입구 ${Math.round(r.hp * 100)}% ${Math.round(r.t)}초 ★${r.stars} · 새는 ${cs.leak} 보호막새 ${cs.shieldLeak} 철갑새 ${cs.armorLeak} 숨은 ${cs.found}/${cs.hidden} 기절 ${cs.ccSec.toFixed(0)}초 멀티 ${cs.multi} 콤보 ${r.g.stats.maxCombo} · `
          + Object.entries(r.heroes).map(([id, v]) => `${NAME[id] || id}:${Math.round((v.dmg / Math.max(1, r.dmg)) * 100)}${T[id] ? `(${Math.round(T[id].repair)}/${Math.round(T[id].prevent)}/${Math.round(T[id].buff / 1000)}k)` : ''}`).join(' '));
      }
    }
  }
  // ── 13) 조건 스테이지 체력 맞춤 (node scripts/lb-balance.js condcalib [--ch=2,3] [--target=90,80,70,62,55] [--seeds=6])
  //  균형 덱(강화 권장+6)의 클리어율이 목표가 되게 장별 COND_HP 를 이분 탐색
  function condcalib() {
    const N = opt('seeds', 6), IT = opt('iters', 5), plus = opt('meta', 6);
    const chs = listArg('ch', '2,3,4,5,6').map(Number);
    const TG = listArg('target', '90,80,70,62,55').map(Number);
    const nos = listArg('nos', '4,6,8,9').map(Number);
    const out = D.COND_HP.slice();
    for (const c of chs) {
      const target = TG[chs.indexOf(c)] !== undefined ? TG[chs.indexOf(c)] : 60;
      const rate = (f) => { D.COND_HP[c - 1] = f; let w = 0; for (const n of nos) { const s = (c - 1) * 10 + n, ids = balFor(c, s, false); w += deckRun(ids, s, Object.fromEntries(ids.map((id) => [id, REC[c - 1] + plus])), N, false).w / nos.length; } return w * 100; };
      let lo = 0.25, hi = 1.2, best = 1, err = 1e9;
      for (let k = 0; k < IT; k++) { const mid = (lo + hi) / 2, r = rate(mid); if (Math.abs(r - target) < err) { err = Math.abs(r - target); best = mid; } if (r > target) lo = mid; else hi = mid; console.log(`  ${c}장 체력 x${mid.toFixed(3)} -> ${r.toFixed(0)}%`); }
      D.COND_HP[c - 1] = best; out[c - 1] = +best.toFixed(2);
      console.log(`${c}장 목표 ${target}% -> COND_HP ${out[c - 1]} (오차 ${err.toFixed(0)})`);
    }
    console.log('COND_HP: ' + JSON.stringify(out));
  }
  // ── 14) 스테이지별 맞춤 (node scripts/lb-balance.js stagecalib --list=41,42 [--seeds=8]) — 균형 덱(조건 맞춤)이 목표 클리어율이 되게 stageAdd 이분 탐색
  //  목표: 장 목표 + 장 앞쪽은 쉽게 (n=1 +7 … n=10 −6) · 출력 JSON 을 data.js STAGE.stageAdd 에 넣는다
  function stagecalib() {
    const N = opt('seeds', 8), IT = opt('iters', 5), RG = opt('range', 5);
    const out = {};
    for (const s of listArg('list', '51').map(Number)) {
      const target = stageTarget(s);
      const base = D.STAGE.stageAdd[s] || 0;
      const rate = (add) => { D.STAGE.stageAdd[s] = base + add; return refRun(s, N, false) * 100; };
      const r0 = rate(0);
      let lo = opt('lo', -RG), hi = opt('hi', RG), best = 0, err = Math.abs(r0 - target);
      hi = Math.min(hi, levelRoom(s)); // 가드레일 넘게 올리지 않기 (넘으면 그만큼 내림)
      if (r0 > target) lo = Math.max(lo, Math.min(0, hi)); else hi = Math.min(hi, 0);
      if (hi < 0 && lo > hi) lo = hi;
      if (err > 100 / N) for (let k = 0; k < IT; k++) { const mid = (lo + hi) / 2, r = rate(mid); if (Math.abs(r - target) < err || (Math.abs(r - target) === err && Math.abs(mid) < Math.abs(best))) { err = Math.abs(r - target); best = mid; } if (r > target) lo = mid; else hi = mid; }
      best = Math.min(best, hi);
      D.STAGE.stageAdd[s] = base + best; out[s] = +(base + best).toFixed(2);
      console.log(`${D.stageLabel(s)} 목표 ${target.toFixed(0)}% · 처음 ${r0.toFixed(0)}% → 가산 ${out[s]} (원래 ${base} · 오차 ${err.toFixed(0)})`);
    }
    console.log('stageAdd: ' + JSON.stringify(out));
  }
  // 스테이지 목표 첫 도전 클리어율: 1~6장 = 장 목표 + 장 앞쪽은 쉽게 (n=1 +6 … n=10 −6 · 보스 −3) · 7 · 8장은 표 (8장이 7장보다 조금씩 낮게)
  //  (10/08 긴장감 개편: 2장부터 더 어렵게 — 예전 1:92 2:88 3:80 4:72 5:65 6:58 · 7 · 8장 표 −4 · 스킬 안 쓰는 초보는 이보다 25~35%p 낮게)
  const TGC = { 1: 90, 2: 78, 3: 75, 4: 72, 5: 68, 6: 64 };
  const TG78 = { 61: 68, 62: 64, 63: 60, 64: 58, 65: 51, 66: 56, 67: 54, 68: 52, 69: 50, 70: 42, 71: 66, 72: 62, 73: 58, 74: 56, 75: 48, 76: 54, 77: 52, 78: 50, 79: 48, 80: 40 };
  // 헬 목표 (10/08): 헬 권장 강화로 잘 짠 덱 첫 도전 — 1장 45 · 2장 42 · 3~6장 38 · 7 · 8장 33 (스테이지 안 기울기는 보통의 절반)
  const HTG = [45, 42, 38, 38, 38, 38, 33, 33]; // (10/08 헬은 단단하게 · 목표 조금 낮게)
  function hellTarget(s) { const c = D.chapterOf(s), n = D.stageNo(s); return HTG[c - 1] + (5.5 - n) * 0.7 - (n === 10 ? 2 : 0); }
  function stageTarget(s) { if (args.includes('--hell')) return hellTarget(s);
    const c = D.chapterOf(s), n = D.stageNo(s); return c >= 7 ? TG78[s] : TGC[c] + (5.5 - n) * 1.4 - (n === 10 ? 3 : 0); }
  // 기준 플레이어 한 판 묶음 클리어율 (1~6장: 균형 덱 · 강화 권장+REF_PLUS / 7 · 8장: T3·T4 역할 덱 강화 15 · 아이템 넉넉히) — 둘 다 ★ · 도감 기준 포함
  const C78 = ['donghan', 'ara', 'gunnyeo', 'sunggu', 'staff', 'hyungyeong'], ITEMS78 = { door: 12, charm: 12, battery: 12, drink: 3, coupon: 10, slot5: 1, slot6: 1 };
  function refRun(s, N, hell, plus = opt('meta', REF_PLUS)) {
    const c = D.chapterOf(s);
    if (hell) plus += D.META_SOFT.hellAdd; // (10/08) 헬은 헬 권장 강화 기준 (예전엔 보통과 같은 강화로 쟀다)
    if (c <= 6) { const ids = balFor(c, s, hell); return deckRun(ids, s, Object.fromEntries(ids.map((id) => [id, REC[c - 1] + plus])), N, hell).w; }
    const meta = Object.fromEntries(C78.map((id) => [id, 15 + opt('meta78', 0) + (hell ? D.META_SOFT.hellAdd : 0)]));
    let w = 0;
    for (let i = 1; i <= N; i++) if (play({ stage: s, deck: placeDeck(C78), partner: C78[0], leader: C78[0], meta, gear: gearAt(s, C78), items: ITEMS78, seed: i * 173 + s * 11 + opt('seedoff', 0), unlocked: [], skills: true, control: true, join: true, tempo: true, hell, ...refOf(s, C78) }).win) w++;
    return w / N;
  }
  // 난이도 여유: test/langbang.test.js 의 가드레일(첫 웨이브 · 웨이브 최고 레벨 · 체력 배율)까지 stageAdd 를 얼마나 더 올릴 수 있나 (−면 넘음)
  function levelRoom(s) {
    const lo = s <= 30, capHp = lo ? 36 : 68, Lc = 1 + (-0.2 + Math.sqrt(0.04 + 0.12 * (capHp - 1))) / 0.06 - 0.05;
    let room = 99;
    for (let w = 1; w <= D.STAGE_WAVES; w++) {
      const L = D.stageWave(s, w).level;
      if (w === 1) room = Math.min(room, (lo ? 18.5 : 27.5) - 0.05 - L);
      room = Math.min(room, (lo ? 31.5 : 43) - 0.05 - L, Lc - L);
    }
    return room;
  }
  if (what === 'room') { for (let c = 1; c <= 8; c++) { const r = []; for (let n = 1; n <= 10; n++) r.push(levelRoom((c - 1) * 10 + n).toFixed(1)); console.log(c + '장 여유 ' + r.join(' ')); } }
  // 헬 스테이지 맞춤 (node scripts/lb-balance.js hellcalib --list=1,...,80 [--seeds=8 --iters=5]) — 헬 권장 강화 기준 클리어율이 헬 목표가 되게 HELL.stageHp 를 로그 이분 탐색 (보통 대비 ×minHp ~ ×hp×1.5)
  if (what === 'hellcalib') {
    const N = opt('seeds', 8), IT = opt('iters', 5), out = {};
    for (const s of listArg('list', '12').map(Number)) {
      const target = hellTarget(s), base = D.HELL.stageHp[s] || 1;
      const rate = (m) => { D.HELL.stageHp[s] = m; return refRun(s, N, true) * 100; };
      const mlo = D.HELL.minHp / D.HELL.hp, mhi = 2; // 헬 체력은 보통의 minHp 배 아래로는 안 내려간다 (절대값으로 찾는다)
      let lo = Math.log(mlo), hi = Math.log(mhi), best = base, r0 = rate(base), err = Math.abs(r0 - target);
      if (r0 > target) lo = Math.log(base); else hi = Math.log(base);
      if (err > 100 / N) for (let k = 0; k < IT; k++) { const mid = (lo + hi) / 2, r = rate(Math.exp(mid)); if (Math.abs(r - target) < err) { err = Math.abs(r - target); best = Math.exp(mid); } if (r > target) lo = mid; else hi = mid; }
      D.HELL.stageHp[s] = best; out[s] = +best.toFixed(2);
      console.log(`${D.stageLabel(s)} 헬 목표 ${target.toFixed(0)}% · 처음 ${r0.toFixed(0)}% → 체력 ×${out[s]} (오차 ${err.toFixed(0)})`);
    }
    console.log('hellStageHp: ' + JSON.stringify(out));
  }
  // 측정만 (node scripts/lb-balance.js stagemeas --list=1,2,... [--seeds=N] [--hell] [--seedoff=K]) — 스테이지별 · 장 평균 (목표와 비교)
  function stagemeas() {
    const N = opt('seeds', 8), hell = args.includes('--hell'), byCh = {};
    for (const kv of listArg('chadd', '')) { const [c, v] = kv.split(':').map(Number); D.STAGE.chapterAdd[c - 1] += v; } // --chadd=5:2 : 장 난이도를 바꿔 보며 측정
    for (const kv of listArg('sadd', '')) { const [st, v] = kv.split(':').map(Number); D.STAGE.stageAdd[st] = v; } // --sadd=30:-1.2 : 스테이지 가산을 바꿔 보며 측정
    for (const kv of listArg('hpx', '')) { const [st, v] = kv.split(':').map(Number); D.STAGE_HPX[st] = v; } // --hpx=23:1.5 : 스테이지 체력 배수를 바꿔 보며 측정
    for (const kv of listArg('chhp', '')) { const [c, v] = kv.split(':').map(Number); D.TENSION.chHp[c - 1] *= v; } // --chhp=3:1.2 : 장 체력 배율(긴장감)을 곱해 보며 측정
    for (const kv of listArg('hellch', '')) { const [c, v] = kv.split(':').map(Number); D.TEMPO.hellCh[c - 1] *= v; } // --hellch=1:0.7 : 헬 장별 체력 배율을 곱해 보며 측정
    const cells = [];
    for (const s of listArg('list', '1,5,10').map(Number)) {
      const r = refRun(s, N, hell) * 100, c = D.chapterOf(s), b = byCh[c] || (byCh[c] = [0, 0, 0]);
      b[0] += r; b[1] += stageTarget(s); b[2]++; cells.push(`${D.stageLabel(s)} ${Math.round(r)}/${Math.round(stageTarget(s))}`);
    }
    if (!args.includes('--quiet')) console.log(cells.join(' '));
    console.log(Object.entries(byCh).map(([c, b]) => `${c}장 ${Math.round(b[0] / b[2])}%(목표 ${Math.round(b[1] / b[2])})`).join(' · '));
  }
  // ── 긴장감 (node scripts/lb-balance.js tension --list=11,...,20 [--seeds=8] [--hell] [--bots=ref,low,beg] [--trace=17])
  //  판이 어떻게 흘러가나: 1초마다 입구 % · 살아 있는 진상 · 처치 → 이긴 판 남은 입구 분포 · 진 판 무너지는 데 걸린 시간 (입구 75% → 0) · 판 중 최저 입구
  //  봇: ref = 기준 플레이어 (스킬 1.5초 늦게 · 카드 40% 아무거나) · low = 스킬 가끔 (8초마다 한 번 확인) · beg = 초보 (스킬 안 씀 · 카드는 기준과 같게 · 총공지만 누름) · rnd = 스킬 안 씀 + 카드 막 고름
  //  강화 = 장 권장 + REF_PLUS (헬: + 헬 권장 가산) · 같은 덱 · 같은 시드
  const BOTS = { ref: { label: '기준', o: {} }, low: { label: '스킬가끔', o: { skillEvery: 480, policy: 'mid' } }, beg: { label: '초보', o: { skills: false, policy: 'mid' } }, rnd: { label: '막고름', o: { skills: false, policy: 'random' } }, smart: { label: '잘고름', o: { policy: 'smart' } }, rsk: { label: '막고름+스킬', o: { policy: 'random' } } };
  function botRun(s, bot, N, hell) {
    const c = D.chapterOf(s);
    let ids = c <= 6 ? balFor(c, s, hell) : C78;
    const conds = DC.stageConds(s, hell), isCounter = (id) => conds.some((cd) => (D.COND[cd] && D.COND[cd].counter || []).includes(id));
    if (args.includes('--nocounter')) { const keep = ids.filter((id) => !isCounter(id)), fill = ['sanghwa', 'ingyu', 'youngjun', 'eunok', 'myunghoon', 'donghan', 'hanna', 'ara', 'junseo', 'wonsik', 'jiwon', 'gunman', 'staff', 'bangjang'].filter((id) => !isCounter(id) && !keep.includes(id)); while (keep.length < ids.length && fill.length) keep.push(fill.shift()); ids = keep; } // --nocounter: 조건 상성 멤버를 빼고 아무나
    const DK = (process.argv.find((x) => x.startsWith('--deck=')) || '').slice(7); if (DK) ids = DK.split('+'); // --deck=myunghoon+bangjang+staff+eunok : 정한 덱
    const SZ = opt('size', 0);
    if (SZ) { const more = [...(c <= 6 ? DECKS[c][1] : C78), 'gunnyeo', 'dohoon', 'wonsik', 'jungmin', 'sanghwa'].filter((id) => !ids.includes(id)); ids = ids.slice(0, SZ); while (ids.length < SZ && more.length) ids.push(more.shift()); } // --size=4|6: 좁은 덱 · 넓은 덱
    const hm = hell ? D.META_SOFT.hellAdd : 0;
    const meta = Object.fromEntries(ids.map((id) => [id, (c <= 6 ? REC[c - 1] + opt('meta', REF_PLUS) : 15 + opt('meta78', 0)) + hm]));
    const runs = [];
    for (let i = 1; i <= N; i++) {
      const tr = [];
      let nextT = 0, lastK = 0, firstHit = -1, t75 = -1, ccA = 0, ccN = 0, nAug = 0;
      const hits = [];
      const r = play({ stage: s, deck: placeDeck(ids), partner: ids[0], leader: ids[0], meta, gear: gearAt(s, ids), items: c >= 7 ? ITEMS78 : itemsAt(Math.round(s * 1.3)), seed: i * 173 + s * 11 + opt('seedoff', 0), unlocked: [], skills: true, control: true, join: true, tempo: true, hell, ...refOf(s, ids), ...BOTS[bot].o,
        onEvents: (g, evs) => { for (const e of evs) { if (e.type === 'baseHit' && e.v > 0) hits.push([e.v / g.base.max * 100, e.by, Math.round(g.t)]); else if (e.type === 'augOffer') nAug++; } },
        onStep: (g) => {
          const f = g.base.hp / g.base.max;
          if (args.includes('--bosstrace') && g.wave === D.STAGE_WAVES && g.t >= (g._btT || 0)) { g._btT = g.t + 10; console.log(`    ${Math.round(g.t)}s 입구${Math.round(f * 100)} ` + g.enemies.filter((e) => !e.dead).map((e) => `${e.type}${e.boss ? (e.mid ? '(M)' : '(B)') : ''} ${Math.round(e.hp / e.maxHp * 100)}% ph${e.phN | 0} y${Math.round(e.y)}/${Math.round(e.stopY)}`).join(' | ')); } // (보스전 늘어짐 추적)
          if (firstHit < 0 && f < 0.999) firstHit = g.t;
          if (t75 < 0 && f < 0.75) t75 = g.t;
          { let a0 = 0, c0 = 0; for (const e of g.enemies) if (!e.dead && e.y > 0) { a0++; if (e.stunT > 0 || e.frozenT > 0 || (e.kbv || 0) < -20) c0++; } if (a0) { ccA += c0 / a0; ccN++; } }
          if (g.t >= nextT) { let alive = 0; for (const e of g.enemies) if (!e.dead && e.y > 0) alive++; tr.push([Math.round(g.t), Math.round(f * 100), alive, g.stats.kills - lastK, g.wave]); lastK = g.stats.kills; nextT += 1; }
        } });
      const minHp = tr.reduce((m, x) => Math.min(m, x[1]), 100);
      const G = r.g, hs = G.heroes.filter((h) => !h.def.summon), lvF = hs.reduce((a, h) => a + D.LEVEL_DMG[h.lv - 1] / D.LEVEL_INTERVAL[h.lv - 1], 0) / Math.max(1, hs.length);
      const grow = { dmg: G.mods.dmg, spd: G.mods.spd, lvF, n: hs.length, wave: r.wave };
      runs.push({ off: r.g._off || [], got: r.g._got || [], pk: Object.assign({ aug: nAug }, r.g._pk || {}), cc: ccN ? ccA / ccN : 0, grow, hits, win: r.win, hp: r.hp, t: r.t, firstHit, t75, minHp, tr, skills: r.g.stats.skills || 0, wave: r.wave });
    }
    return runs;
  }
  function tension() {
    const N = opt('seeds', 8), hell = args.includes('--hell'), bots = listArg('bots', 'ref,beg');
    const list = listArg('list', '5,15,25,35,45,55').map(Number);
    const q = (arr, f) => { if (!arr.length) return NaN; const v = arr.slice().sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.floor(f * v.length))]; };
    const byCh = {};
    for (const s of list) {
      const c = D.chapterOf(s);
      const cells = [];
      for (const b of bots) {
        const runs = botRun(s, b, N, hell), A = ((byCh[c] || (byCh[c] = {}))[b] || (byCh[c][b] = []));
        A.push(...runs);
        const w = runs.filter((x) => x.win), l = runs.filter((x) => !x.win);
        cells.push(`${BOTS[b].label} ${Math.round((w.length / N) * 100)}% 남은입구 ${w.length ? Math.round(q(w.map((x) => x.hp * 100), 0.5)) : '-'} 이긴 판 ${w.length ? Math.round(w.reduce((a, x) => a + x.t, 0) / w.length) + '초' : '-'}`);
        if (opt('trace', 0) === s) for (const x of runs.slice(0, 3)) console.log(`  [${BOTS[b].label} ${x.win ? '승' : '패'}] ` + x.tr.filter((_, k) => k % opt('every', 10) === 0 || (args.includes('--tail') && k > x.tr.length - 25)).map((y) => `${y[0]}s W${y[4]} 입구${y[1]} 적${y[2]}`).join(' | '));
      }
      if (!args.includes('--quiet')) console.log(`${D.stageLabel(s)} ${cells.join(' · ')}`);
    }
    console.log(`\n■ 장별 요약${hell ? ' (헬)' : ''} — 이긴 판 남은 입구 25/50/75% · 90%+ 로 이긴 비율 · 진 판: 입구 75% → 0 걸린 초 (중앙) · 판 중 최저 입구 30~80% 인 판 비율(긴장)`);
    for (const [c, m] of Object.entries(byCh)) for (const b of bots) {
      const runs = m[b], w = runs.filter((x) => x.win), l = runs.filter((x) => !x.win);
      const hp = w.map((x) => x.hp * 100), col = l.map((x) => x.t - (x.t75 >= 0 ? x.t75 : x.t));
      const tense = runs.filter((x) => x.minHp >= 30 && x.minHp <= 80).length / runs.length;
      if (args.includes('--hits')) { const H = runs.flatMap((x) => x.hits); const by = {}; for (const h of H) by[h[1]] = (by[h[1]] || 0) + h[0]; console.log(`   한 대 크기(입구 %) 50/90/99: ${[0.5, 0.9, 0.99].map((f) => q(H.map((h) => h[0]), f).toFixed(1)).join('/')} · 판당 ${Math.round(H.length / runs.length)}대 · 몫 ${Object.entries(by).sort((a, b2) => b2[1] - a[1]).slice(0, 6).map(([k, v]) => k + ' ' + Math.round(v / runs.length)).join(' ')}`); }
      if (args.includes('--picks')) { const K = {}; for (const x of runs) for (const [k, v] of Object.entries(x.pk)) K[k] = (K[k] || 0) + v / runs.length; const tot = Object.entries(K).reduce((a, [k, v]) => a + (k === 'welcome' ? 0 : v), 0), card = tot - (K.aug || 0), mins = runs.reduce((a, x) => a + x.t, 0) / runs.length / 60; console.log(`   판 중 고르기 ${tot.toFixed(1)}번/판 (카드 ${card.toFixed(1)} · 증강 ${(K.aug || 0).toFixed(1)} · 시작 전 웰컴 ${(K.welcome || 0).toFixed(1)} 따로) · 분당 ${(tot / mins).toFixed(2)} · 카드 간격 ${Math.round(mins * 60 / Math.max(0.1, tot))}초 · ` + Object.entries(K).filter(([k]) => k !== 'aug').sort((a, b2) => b2[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' ')); }
      if (args.includes('--grow')) { const gw = runs.filter((x) => x.win).map((x) => x.grow); if (gw.length) { const av = (f) => gw.reduce((a, x) => a + f(x), 0) / gw.length; console.log(`   한 판 성장 (이긴 판 끝): 공격 ×${av((x) => x.dmg).toFixed(2)} · 공속 ×${av((x) => x.spd).toFixed(2)} · 멤버 레벨 몫 ×${av((x) => x.lvF).toFixed(2)} · 합계 ×${av((x) => x.dmg * x.spd * x.lvF).toFixed(2)} · ${av((x) => x.n).toFixed(1)}명`); } }
      console.log(`${c}장 ${pad(BOTS[b].label, 8)} 클리어 ${pad(Math.round((w.length / runs.length) * 100) + '%', 5)} 남은입구 ${hp.length ? [0.25, 0.5, 0.75].map((f) => Math.round(q(hp, f))).join('/') : '-'} · 90%+ ${hp.length ? Math.round((hp.filter((v) => v >= 90).length / hp.length) * 100) : '-'}% · 붕괴 ${col.length ? Math.round(q(col, 0.5)) + '초' : '-'} · 긴장 ${Math.round(tense * 100)}% · 스킬 ${Math.round(runs.reduce((a, x) => a + x.skills, 0) / runs.length)}번 · 제어 ${Math.round(runs.reduce((a, x) => a + x.cc, 0) / runs.length * 100)}% · 시간 ${Math.round(runs.reduce((a, x) => a + x.t, 0) / runs.length)}초`);
    }
  }
  if (what === 'tension') tension();
  // ── 스킬 몫 (node scripts/lb-balance.js skshare [--ch=1,..,8] [--nos=3,6,9] [--seeds=4] [--win=100] [--member])
  //  기준 플레이어(스킬 씀) vs 같은 사람이 스킬만 안 씀 — 같은 덱 · 같은 시드
  //   · 클리어 차이 (%p) · 팀 피해 몫 = 1 − (스킬 안 쓴 판 앞 win 초 팀 피해 / 스킬 쓴 판 앞 win 초 팀 피해) — 바로 맞힌 피해 + 버프 · 늦게 터지는 것까지 다
  //   · --member: 멤버마다 자기 스킬만 끈 판 → 그 멤버 피해 중 스킬 몫
  function skshare() {
    const N = opt('seeds', 4), WIN = opt('win', 100), nos = listArg('nos', '3,6,9').map(Number), member = args.includes('--member');
    const deckOf = (c, s) => (c <= 6 ? balFor(c, s, false) : C78);
    const one = (s, o) => {
      const c = D.chapterOf(s), ids = deckOf(c, s), meta = Object.fromEntries(ids.map((id) => [id, c <= 6 ? REC[c - 1] + REF_PLUS : 15]));
      let d0 = null, by = null;
      const r = play({ stage: s, deck: placeDeck(ids), partner: ids[0], leader: ids[0], meta, gear: gearAt(s, ids), items: c >= 7 ? ITEMS78 : itemsAt(Math.round(s * 1.3)), seed: o.seed, unlocked: [], skills: o.skills, control: true, join: true, tempo: true, noSkFor: o.noSkFor, ...refOf(s, ids),
        onStep: (g) => { if (d0 === null && g.t >= WIN) { d0 = g.stats.damage; by = Object.fromEntries(g.heroes.map((h) => [h.id, h.dmgDone])); } } });
      if (d0 === null) { d0 = r.g.stats.damage * WIN / Math.max(1, r.t); by = Object.fromEntries(r.g.heroes.map((h) => [h.id, h.dmgDone * WIN / Math.max(1, r.t)])); }
      return { win: r.win, d: d0, by, ids };
    };
    const tot = {};
    for (const c of listArg('ch', '1,2,3,4,5,6,7,8').map(Number)) {
      let wOn = 0, wOff = 0, dOn = 0, dOff = 0, n = 0; const mOn = {}, mOff = {};
      for (const k of nos) {
        const s = (c - 1) * 10 + k;
        for (let i = 1; i <= N; i++) {
          const seed = i * 173 + s * 11, a = one(s, { seed, skills: true }), b = one(s, { seed, skills: false });
          wOn += a.win ? 1 : 0; wOff += b.win ? 1 : 0; dOn += a.d; dOff += b.d; n++;
          if (member) for (const id of a.ids) { const m = one(s, { seed, skills: true, noSkFor: id }); mOn[id] = (mOn[id] || 0) + (a.by[id] || 0); mOff[id] = (mOff[id] || 0) + (m.by[id] || 0); const T = tot[id] || (tot[id] = [0, 0]); T[0] += a.by[id] || 0; T[1] += m.by[id] || 0; }
        }
      }
      console.log(`${c}장  클리어 스킬 씀 ${Math.round((wOn / n) * 100)}% · 안 씀 ${Math.round((wOff / n) * 100)}% (차이 ${Math.round(((wOn - wOff) / n) * 100)}%p) · 앞 ${WIN}초 팀 피해 중 스킬 몫 ${Math.round((1 - dOff / Math.max(1, dOn)) * 100)}%` + (member ? '  · 멤버 ' + Object.keys(mOn).map((id) => `${NAME[id] || id} ${Math.round((1 - mOff[id] / Math.max(1, mOn[id])) * 100)}%`).join(' ') : ''));
    }
    if (member) console.log('멤버 전체: ' + Object.entries(tot).map(([id, [a, b]]) => `${NAME[id] || id} ${Math.round((1 - b / Math.max(1, a)) * 100)}%`).join(' · '));
  }
  if (what === 'skshare') skshare();
  if (what === 'decks') for (let s = 1; s <= 60; s++) console.log(D.stageLabel(s), balFor(D.chapterOf(s), s, false).join(','));
  // 장 체력 맞춤 (node scripts/lb-balance.js chcalib [--ch=1,..,8] [--seeds=6] [--iters=5] [--hell]) — 장 평균 클리어율이 목표가 되게 TENSION.chHp(헬: TEMPO.hellCh) 를 로그 이분 탐색
  if (what === 'chcalib') {
    const N = opt('seeds', 6), IT = opt('iters', 5), hell = args.includes('--hell'), out = {};
    for (const c of listArg('ch', '1,2,3,4,5,6,7,8').map(Number)) {
      const arr = hell ? D.TEMPO.hellCh : D.TENSION.chHp, base = arr[c - 1] || 1, list = [];
      for (let n = 1; n <= 10; n++) list.push((c - 1) * 10 + n);
      const tg = list.reduce((a, s) => a + stageTarget(s), 0) / list.length;
      const rate = (m) => { arr[c - 1] = base * m; return list.reduce((a, s) => a + refRun(s, N, hell), 0) / list.length * 100; };
      let lo = Math.log(0.4), hi = Math.log(1.6), best = 1, err = 1e9;
      for (let k = 0; k < IT; k++) { const mid = (lo + hi) / 2, r = rate(Math.exp(mid)); if (Math.abs(r - tg) < err) { err = Math.abs(r - tg); best = Math.exp(mid); } console.log(`  ${c}장 ×${Math.exp(mid).toFixed(3)} → ${r.toFixed(0)}% (목표 ${tg.toFixed(0)})`); if (r > tg) lo = mid; else hi = mid; }
      arr[c - 1] = base * best; out[c] = +(base * best).toFixed(3);
      console.log(`${c}장 → ${out[c]} (오차 ${err.toFixed(0)})`);
    }
    console.log((hell ? 'hellCh: ' : 'chHp: ') + JSON.stringify(out));
  }
  // 카드 고른 비율 · 고른 판 vs 안 고른 판 클리어율 (node scripts/lb-balance.js cardstat --list=... --bots=smart [--seeds=N])
  if (what === 'cardstat') {
    const N = opt('seeds', 6), bot = listArg('bots', 'smart')[0], st = {};
    let all = 0, allW = 0;
    for (const s of listArg('list', '3,5,13,15,23,25,33,35,43,45,53,55').map(Number)) for (const x of botRun(s, bot, N, args.includes('--hell'))) {
      all++; if (x.win) allW++;
      const offered = new Set(x.off), got = new Set(x.got);
      for (const k of x.off) (st[k] || (st[k] = { off: 0, got: 0, runsOff: 0, runsGot: 0, wGot: 0, wNot: 0, runsNot: 0 })).off++;
      for (const k of x.got) st[k].got++;
      for (const k of offered) { const o = st[k]; o.runsOff++; if (got.has(k)) { o.runsGot++; if (x.win) o.wGot++; } else { o.runsNot++; if (x.win) o.wNot++; } }
    }
    console.log(`카드 통계 (${bot} · 판 ${all} · 클리어 ${Math.round(allW / all * 100)}%) — 뜬 횟수 · 고른 비율 · 고른 판 클리어 vs 떴는데 안 고른 판 클리어`);
    for (const [k, o] of Object.entries(st).sort((a, b) => b[1].got / b[1].off - a[1].got / a[1].off)) console.log(`${pad(k, 16)} 뜸 ${pad(o.off, 5)} 고름 ${pad(Math.round(o.got / o.off * 100) + '%', 5)} 고른 판 ${o.runsGot ? Math.round(o.wGot / o.runsGot * 100) + '%' : '-'}(${o.runsGot}) · 안 고른 판 ${o.runsNot ? Math.round(o.wNot / o.runsNot * 100) + '%' : '-'}(${o.runsNot})`);
  }
  // ── 15) 아무 덱이나 (node scripts/lb-balance.js custom --list=61,62 --decks=donghan+ara+...|... [--m=15] [--lm=20] [--seeds=N] [--hell])
  //  덱마다 클리어율 · 피해 몫 (lm: LEGEND 강화 · 7장처럼 아이템 넉넉히)
  function custom() {
    const N = opt('seeds', 8), m = opt('m', 15), lm = opt('lm', 20), hell = args.includes('--hell');
    const list = listArg('list', '61,62,63,64,65,66,67,68,69,70').map(Number);
    const decks = ((process.argv.find((x) => x.startsWith('--decks=')) || '').slice(8)).split('|').filter(Boolean).map((d) => d.split('+'));
    const items = { door: 12, charm: 12, battery: 12, drink: 3, coupon: 10, slot5: 1, slot6: 1 };
    for (const ids of decks) {
      const meta = Object.fromEntries(ids.map((id) => [id, D.HEROES[id] && D.HEROES[id].legend ? lm : m]));
      let w = 0, n = 0; const share = {};
      for (const s of list) for (let i = 1; i <= N; i++) {
        const r = play({ stage: s, deck: placeDeck(ids), partner: ids[0], leader: ids[0], meta, gear: gearAt(s, ids), items, seed: i * 173 + s * 11 + opt('seedoff', 0), unlocked: [], skills: true, control: true, join: true, tempo: true, hell });
        if (r.win) w++; n++;
        for (const [id, v] of Object.entries(r.heroes)) share[id] = (share[id] || 0) + v.dmg / Math.max(1, r.dmg);
      }
      console.log(`${pad(ids.map((id) => NAME[id] || id).join('+'), 46)} ${Math.round((w / n) * 100)}%  · 피해 몫 ${Object.entries(share).sort((a, b) => b[1] - a[1]).map(([id, v]) => `${NAME[id] || id} ${Math.round((v / n) * 100)}`).join(' ')}`);
    }
  }
  // ── 16) 한 판 성장 (node scripts/lb-balance.js growth [--ch=1,3,5,7] [--nos=3,6,9] [--seeds=6] [--lib=예전 폴더])
  //  레벨업(경험치) 횟수 · 카드 고른 횟수(합류 공짜 포함) · 멤버 레벨 카드 · 끝났을 때 Lv5/Lv3 멤버 수 · 클리어율
  function growth() {
    const N = opt('seeds', 6), plus = opt('meta', 6);
    const chs = listArg('ch', '1,3,5,7').map(Number), nos = listArg('nos', '3,6,9').map(Number);
    for (const kv of listArg('chadd', '')) { const [c, v] = kv.split(':').map(Number); D.STAGE.chapterAdd[c - 1] += v; } // --chadd=5:-0.5 : 장 난이도를 바꿔 보며 측정
    const C7 = ['donghan', 'ara', 'gunnyeo', 'sunggu', 'staff', 'hyungyeong'], items7 = { door: 12, charm: 12, battery: 12, drink: 3, coupon: 10, slot5: 1, slot6: 1 };
    console.log(pad('장', 5) + pad('레벨업', 8) + pad('카드', 7) + pad('합류', 6) + pad('Lv카드', 8) + pad('Lv5', 6) + pad('Lv3+', 6) + '클리어');
    for (const c of chs) {
      const a = { lv: 0, pick: 0, join: 0, hl: 0, l5: 0, l3: 0, w: 0, n: 0 };
      for (const no of nos) {
        const s = (c - 1) * 10 + no, ids = c >= 7 ? C7 : balFor(c, s, false);
        const meta = Object.fromEntries(ids.map((id) => [id, c >= 7 ? 15 : REC[c - 1] + plus]));
        for (let i = 1; i <= N; i++) {
          const r = play({ stage: s, deck: placeDeck(ids), partner: ids[0], leader: ids[0], meta, gear: gearAt(s, ids), items: c >= 7 ? items7 : itemsAt(Math.round(s * 1.3)), seed: i * 173 + s * 11 + opt('seedoff', 0), unlocked: [], skills: true, control: true, join: true, tempo: true, hell: args.includes('--hell') });
          const pk = r.g._pk || {};
          a.lv += r.g.level - 1; a.pick += r.g.pickN; a.join += pk.join || 0; a.hl += pk.heroLv || 0; a.l5 += r.g.heroes.filter((h) => h.lv >= 5).length; a.l3 += r.g.heroes.filter((h) => h.lv >= 3).length; a.w += r.win ? 1 : 0; a.n++;
        }
      }
      const f = (v) => (v / a.n).toFixed(1);
      console.log(pad(c + '장', 5) + pad(f(a.lv), 8) + pad(f(a.pick), 7) + pad(f(a.join), 6) + pad(f(a.hl), 8) + pad(f(a.l5), 6) + pad(f(a.l3), 6) + Math.round((a.w / a.n) * 100) + '%');
    }
  }
  // ── 17) 멤버 순위 (node scripts/lb-balance.js rank [--ch=1,3,5,7] [--nos=3,6,10] [--seeds=6] [--hell] [--only=id,id] [--meta=6])
  //  '기본 덱(칸−1명) + 한 명'으로 판을 돌려, 빈자리(zz)를 넣었을 때보다 클리어율이 얼마나 오르나 = 그 멤버의 몫
  //  기본 덱은 두 벌(A · B) — 그 멤버가 든 덱은 빼고 잰다 · 몫 = 같은 기본 덱 평균보다 클리어율 +%p (빈자리 대비 = 빈자리보다) · 피해 몫 · 처치 몫 · 보스 스테이지(10번) 클리어
  function rank() {
    const N = opt('seeds', 6), plus = opt('meta', 6), hell = args.includes('--hell'), LEAD = args.includes('--lead');
    const chs = listArg('ch', '1,3,5,7').map(Number), nos = listArg('nos', '3,6,10').map(Number);
    const only = listArg('only', '');
    for (const kv of listArg('hard', '')) { const [c, v] = kv.split(':').map(Number); D.STAGE.chapterAdd[c - 1] += v; } // --hard=1:4,3:3 : 재는 동안만 장 난이도를 올려 빈자리 덱이 반쯤 깨게 (차이가 잘 보이게)
    const BASES = { A: ['gunman', 'hanna', 'eunok', 'staff', 'sunggu'], B: ['myunghoon', 'youngjun', 'jiwon', 'gunnyeo', 'ingyu'] };
    const items7 = { door: 12, charm: 12, battery: 12, drink: 3, coupon: 10, slot5: 1, slot6: 1 };
    const ids0 = Object.keys(D.HEROES).filter((id) => id !== 'zz' && !D.HEROES[id].summon && (!only.length || only.includes(id)));
    const sizeOf = (c) => (c >= 5 ? 6 : c >= 3 ? 5 : 4);
    function runSet(ids, c, X) {
      const m = Math.max(0, Math.min(D.META_MAX, REC[c - 1] + plus + (c >= 7 ? opt('m7', 2) : 0)));
      const meta = Object.fromEntries(ids.map((id) => [id, m]));
      const o = { w: 0, n: 0, sh: 0, kl: 0, bw: 0, bn: 0 };
      for (const no of nos) {
        const s = (c - 1) * 10 + no;
        for (let i = 1; i <= N; i++) {
          const r = play({ stage: s, deck: placeDeck(ids), partner: ids[0], leader: ids[0], meta, gear: gearAt(s, ids), items: c >= 7 ? items7 : itemsAt(Math.round(s * 1.3)), seed: i * 173 + s * 11 + opt('seedoff', 0), unlocked: [], skills: true, control: true, join: true, tempo: true, hell });
          o.n++; if (r.win) o.w++;
          if (no === 10) { o.bn++; if (r.win) o.bw++; }
          if (X && r.heroes[X]) { o.sh += r.heroes[X].dmg / Math.max(1, r.dmg); o.kl += r.heroes[X].kills / Math.max(1, r.g.stats.kills); }
        }
      }
      return o;
    }
    const rows = {};
    console.log(`\n■ 멤버 순위${hell ? ' (헬)' : ''} — 기본 덱 + 한 명 · 합류 · 템포 · 스킬 자동 · 스테이지 ${nos.join(',')}번 × ${N}판`);
    for (const c of chs) {
      const k = sizeOf(c) - 1;
      const base = { A: BASES.A.slice(0, k), B: BASES.B.slice(0, k) };
      const zz = { A: runSet([...base.A, 'zz'], c), B: runSet([...base.B, 'zz'], c) };
      console.log(`${c}장 빈자리 기준: A ${Math.round((zz.A.w / zz.A.n) * 100)}% · B ${Math.round((zz.B.w / zz.B.n) * 100)}%`);
      for (const X of ids0) {
        const a = { v: 0, w: 0, n: 0, sh: 0, kl: 0, bw: 0, bn: 0, k: 0, p: {} };
        for (const b of ['A', 'B']) {
          if (base[b].includes(X)) continue;
          const r = runSet(LEAD ? [X, ...base[b]] : [...base[b], X], c, X); // --lead: 그 멤버가 대장(1번 · 처음부터 · 주력)
          a.v += r.w / r.n - zz[b].w / zz[b].n; a.k++; a.p[b] = r.w / r.n;
          a.w += r.w; a.n += r.n; a.sh += r.sh; a.kl += r.kl; a.bw += r.bw; a.bn += r.bn;
        }
        const R = rows[X] || (rows[X] = {});
        R[c] = { z: a.v / a.k, w: a.w / a.n, sh: a.sh / a.n, kl: a.kl / a.n, b: a.bn ? a.bw / a.bn : 0, p: a.p };
      }
      // 몫 = 같은 기본 덱에서 잰 모든 멤버 평균보다 클리어율이 얼마나 높나 (기본 덱 A · B 세기 차이를 지운다)
      const mean = {};
      for (const b of ['A', 'B']) { const v = ids0.map((X) => rows[X][c].p[b]).filter((x) => x !== undefined); mean[b] = v.reduce((x, y) => x + y, 0) / Math.max(1, v.length); }
      for (const X of ids0) { const R = rows[X][c], bs = Object.keys(R.p); R.v = bs.reduce((x, b) => x + R.p[b] - mean[b], 0) / bs.length; }
    }
    console.log('\n' + pad('멤버', 10) + pad('등급', 8) + chs.map((c) => pad(`${c}장 몫/빈자리 대비/클/피해/처치/보스`, 32)).join('') + '평균 몫');
    const list = Object.entries(rows).map(([id, R]) => [id, R, chs.reduce((x, c) => x + R[c].v, 0) / chs.length]).sort((x, y) => y[2] - x[2]);
    const P = (v) => Math.round(v * 100);
    for (const [id, R, av] of list) console.log(pad(NAME[id] || id, 10) + pad(D.TIER_NAME[D.HERO_TIER[id]], 8) + chs.map((c) => pad(`${P(R[c].v) >= 0 ? '+' : ''}${P(R[c].v)} / ${P(R[c].z) >= 0 ? '+' : ''}${P(R[c].z)} / ${P(R[c].w)} / ${P(R[c].sh)} / ${P(R[c].kl)} / ${P(R[c].b)}`, 32)).join('') + `${P(av) >= 0 ? '+' : ''}${P(av)}`);
    const jp = (process.argv.find((x) => x.startsWith('--json=')) || '').slice(7);
    if (jp) require('fs').writeFileSync(jp, JSON.stringify(rows));
  }
  // ── 18) 바뀐 멤버 자세히 (node scripts/lb-balance.js focus [--only=soyoung,wonsik] [--ch=1,3,5,7] [--nos=3,5,8,10] [--seeds=6] [--hard=...])
  //  실제로 쓸 법한 덱(균형 덱)의 한 칸에 그 멤버 vs 빈자리 · 피해 몫(소환 포함) · 멤버별 판 중 숫자
  //   정소영: 준영 등판/퇴근 횟수 · 준영 피해 몫  정원식: 막아서기 횟수 · 평균/최대 버틴 초  송바울: 보드 돌진 · 정비 (분당)  문동한: 카페인 풀충전 횟수
  function focus() {
    const N = opt('seeds', 6), plus = opt('meta', 0);
    const chs = listArg('ch', '1,3,5,7').map(Number), nos = listArg('nos', '3,5,8,10').map(Number);
    for (const kv of listArg('hard', '')) { const [c, v] = kv.split(':').map(Number); D.STAGE.chapterAdd[c - 1] += v; }
    const ids0 = listArg('only', 'soyoung,baul,donghan,dohoon,wonsik,gunnyeo,jungmin,bangjang,sanghwa,ingyu,hochan,jeongseob');
    const REAL = { 1: DECKS[1][2], 3: DECKS[3][2], 5: DECKS[5][2], 7: ['donghan', 'ara', 'gunnyeo', 'sunggu', 'staff', 'hyungyeong'] };
    const items7 = { door: 12, charm: 12, battery: 12, drink: 3, coupon: 10, slot5: 1, slot6: 1 };
    const one = (ids, c, X) => {
      const m = Math.max(0, Math.min(D.META_MAX, REC[c - 1] + plus + (c >= 7 ? 2 : 0)));
      const meta = Object.fromEntries(ids.map((id) => [id, m]));
      const a = { w: 0, n: 0, bw: 0, bn: 0, sh: 0, jy: 0, sum: 0, leave: 0, sit: 0, sitN: 0, sitMax: 0, dash: 0, fix: 0, cafe: 0, min: 0 };
      for (const no of nos) {
        const s = (c - 1) * 10 + no;
        for (let i = 1; i <= N; i++) {
          let cur = 0;
          const onStep = (g) => {
            for (const e of g.events) {
              if (e.type === 'summon' && e.hero === 'junyoung') a.sum++;
              else if (e.type === 'jyLeave') a.leave++;
              else if (e.type === 'boardDash') a.dash++;
              else if (e.type === 'boardFixed') a.fix++;
              else if (e.type === 'cafeUp') a.cafe++;
            }
            const w = X === 'wonsik' && g.heroes.find((h) => h.id === 'wonsik');
            if (w) { if (w.wsSt === 'sit') { cur += 1 / 60; a.sit += 1 / 60; } else if (cur > 0) { a.sitN++; a.sitMax = Math.max(a.sitMax, cur); cur = 0; } }
          };
          const r = play({ stage: s, deck: placeDeck(ids), partner: ids[0], leader: ids[0], meta, gear: gearAt(s, ids), items: c >= 7 ? items7 : itemsAt(Math.round(s * 1.3)), seed: i * 173 + s * 11, unlocked: [], skills: true, control: true, join: true, tempo: true, onStep: X ? onStep : null });
          if (cur > 0) { a.sitN++; a.sitMax = Math.max(a.sitMax, cur); }
          a.n++; if (r.win) a.w++;
          if (no === 10 || no === 5) { a.bn++; if (r.win) a.bw++; }
          a.min += r.t / 60;
          if (X) { const own = (r.heroes[X] ? r.heroes[X].dmg : 0) + (X === 'soyoung' && r.heroes.junyoung ? r.heroes.junyoung.dmg : 0); a.sh += own / Math.max(1, r.dmg); if (r.heroes.junyoung) a.jy += r.heroes.junyoung.dmg / Math.max(1, r.dmg); }
        }
      }
      return a;
    };
    const P = (v) => Math.round(v * 100), zc = {};
    console.log(`\n■ 바뀐 멤버 자세히 — 균형 덱 한 칸 · 합류 · 템포 · 스킬 자동 · 스테이지 ${nos.join(',')}번 × ${N}판 (5 · 10번 = 중간 보스 · 보스)`);
    for (const c of chs) {
      const deck = REAL[c] || DECKS[c][2];
      console.log(`${c}장 덱: ${deck.map((id) => NAME[id] || id).join('+')}`);
      for (const X of ids0) {
        const withX = deck.includes(X) ? deck : [...deck.slice(0, -1), X];
        const noX = [...withX.filter((y) => y !== X), 'zz']; // 빈자리는 맨 뒤 (그 멤버가 대장이면 다음 멤버가 대장)
        const zk = c + ':' + noX.join('+'), a = one(withX, c, X), z = zc[zk] || (zc[zk] = one(noX, c, null));
        let extra = '';
        if (X === 'soyoung') extra = `준영 등판 ${(a.sum / a.n).toFixed(1)} · 퇴근 ${(a.leave / a.n).toFixed(1)} (판당) · 준영 피해 몫 ${P(a.jy / a.n)}%`;
        if (X === 'wonsik') extra = `막아서기 ${(a.sitN / a.n).toFixed(1)}번/판 · 평균 ${(a.sit / Math.max(1, a.sitN)).toFixed(1)}초 · 최대 ${a.sitMax.toFixed(1)}초`;
        if (X === 'baul') extra = `보드 돌진 ${(a.dash / a.min).toFixed(0)}/분 · 정비 ${(a.fix / a.min).toFixed(1)}/분`;
        if (X === 'donghan') extra = `카페인 풀충전 ${(a.cafe / a.n).toFixed(1)}번/판`;
        console.log(`  ${pad(NAME[X] || X, 8)} 클리어 ${P(a.w / a.n)}% (빈자리 ${P(z.w / z.n)}% · ${P(a.w / a.n - z.w / z.n) >= 0 ? '+' : ''}${P(a.w / a.n - z.w / z.n)}) · 보스판 ${P(a.bw / Math.max(1, a.bn))}% (빈자리 ${P(z.bw / Math.max(1, z.bn))}%) · 피해 몫 ${P(a.sh / a.n)}%  ${extra}`);
      }
    }
  }
  const t0 = Date.now();
  if (what === 'focus') focus();
  if (what === 'rank') rank();
  if (what === 'growth') growth();
  if (what === 'diag') diag();
  if (what === 'condcalib') condcalib();
  // ── 17) 주간 진상 특성 (node scripts/lb-balance.js wtrait --list=8,15,25 --seeds=4) — 특성마다 난이도가 비슷한지 (특성 없음과 비교)
  function wtrait() {
    const N = opt('seeds', 4), plus = opt('meta', REF_PLUS), list = listArg('list', '8,15,25').map(Number);
    const ts = ['', ...(listArg('traits', '').length ? listArg('traits', '') : D.WEEK_TRAITS.map((t) => t.id))];
    for (const t of ts) {
      WTR = t || undefined;
      let w = 0, hp = 0, n = 0;
      for (const s of list) { const c = D.chapterOf(s), ids = balFor(c, s, false), meta = Object.fromEntries(ids.map((id) => [id, REC[c - 1] + plus])); const r = deckRun(ids, s, meta, N, false); w += r.w * N; hp += (r.hp || 0) * r.w * N; n += N; }
      console.log(`${pad(t ? D.WEEK_TRAIT[t].name : '(특성 없음)', 20)} 클리어 ${Math.round((w / n) * 100)}% · 이긴 판 입구 ${Math.round((hp / Math.max(1, w)) * 100)}%`);
    }
  }
  if (what === 'wtrait') wtrait();
  // 판 길이 (node scripts/lb-balance.js runlen --list=3,15,25,... [--seeds=4]) — 기준 덱 한 판 시간(초) · 클리어 · 처치 수 · 스킬 횟수
  function runlen() {
    const N = opt('seeds', 4), all = [];
    for (const s of listArg('list', '3,15,25,35,45,55').map(Number)) {
      const c = D.chapterOf(s), ids = c <= 6 ? balFor(c, s, false) : C78, meta = Object.fromEntries(ids.map((id) => [id, c <= 6 ? REC[c - 1] + REF_PLUS : 15]));
      let t = 0, w = 0, k = 0, sk = 0, kd = 0, kf = 0, kp = 0, cb = 0; const ksrc = {}, kby = {};
      for (let i = 1; i <= N; i++) { const r = play({ stage: s, deck: placeDeck(ids), partner: ids[0], leader: ids[0], meta, gear: gearAt(s, ids), items: c >= 7 ? ITEMS78 : itemsAt(Math.round(s * 1.3)), seed: i * 173 + s * 11, unlocked: [], skills: true, control: true, join: true, tempo: true, ...refOf(s, ids) }); t += r.t; if (r.win) w++; k += r.g.stats.kills; sk += r.g.stats.skills || 0; kd += r.g.stats.kd || 0; kf += r.g.stats.kdFill || 0; for (const [q, v] of Object.entries(r.g.stats.kdSrc || {})) ksrc[q] = (ksrc[q] || 0) + v / N; for (const [q, v] of Object.entries(r.g.stats.kdBy || {})) kby[q] = (kby[q] || 0) + v / N; kp += r.g.stats.kdPeak || 0; cb += (r.g.stats.castBreak | 0) / N; }
      all.push(t / N);
      console.log(`${D.stageLabel(s)} ${(t / N).toFixed(0)}초 (${((t / N) / 60).toFixed(1)}분) · 클리어 ${Math.round((w / N) * 100)}% · 처치 ${Math.round(k / N)} · 스킬 ${Math.round(sk / N)}번 · 쓰러짐 ${(kd / N).toFixed(1)}번 (게이지 ${Math.round(kf / N)} · 최고 ${Math.round(kp / N * 100)}% · ${Object.entries(ksrc).map(([q, v]) => q + ' ' + Math.round(v)).join(' ')}) · 끊김 ${cb.toFixed(1)}${args.includes('--by') ? ' · 진상별 ' + Object.entries(kby).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([q, v]) => q + ' ' + Math.round(v)).join(' ') : ''}`);
    }
    console.log(`평균 ${(all.reduce((a, b) => a + b, 0) / all.length).toFixed(0)}초`);
  }
  if (what === 'runlen') runlen();
  if (what === 'stagecalib') stagecalib();
  if (what === 'stagemeas') stagemeas();
  // 진상 감사 (node scripts/lb-balance.js foes --list=1,...,80 [--seeds=8]) — 기준 플레이어 판에서 진상 종류마다 입구 피해 몫 · 쓰러짐 게이지 몫 (진 판 · 전체) — 한 진상이 패배를 혼자 만드는지
  if (what === 'foes') {
    const N = opt('seeds', 8), byCh = {};
    for (const s of listArg('list', '1,5,10').map(Number)) {
      const c = D.chapterOf(s), o = byCh[c] || (byCh[c] = { n: 0, lost: 0, door: {}, doorL: {}, kd: {}, kdL: {} });
      const ids = c <= 6 ? balFor(c, s, false) : C78, meta = Object.fromEntries(ids.map((id) => [id, c <= 6 ? REC[c - 1] + REF_PLUS : 15]));
      for (let i = 1; i <= N; i++) {
        const r = play({ stage: s, deck: placeDeck(ids), partner: ids[0], leader: ids[0], meta, gear: gearAt(s, ids), items: c >= 7 ? ITEMS78 : itemsAt(Math.round(s * 1.3)), seed: i * 173 + s * 11 + opt('seedoff', 0), unlocked: [], skills: true, control: true, join: true, tempo: true, ...refOf(s, ids) });
        const dm = r.g._doorBy || {}, km = r.g.stats.kdBy || {}, dT = Object.values(dm).reduce((a, b) => a + b, 0) || 1, kT = Object.values(km).reduce((a, b) => a + b, 0) || 1;
        o.n++; if (!r.win) o.lost++;
        for (const [k, v] of Object.entries(dm)) { o.door[k] = (o.door[k] || 0) + v / dT; if (!r.win) o.doorL[k] = (o.doorL[k] || 0) + v / dT; }
        for (const [k, v] of Object.entries(km)) { o.kd[k] = (o.kd[k] || 0) + v / kT; if (!r.win) o.kdL[k] = (o.kdL[k] || 0) + v / kT; }
      }
    }
    const top = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${D.shortName(k)} ${Math.round((v / Math.max(1, n)) * 100)}`).join(' · ');
    for (const [c, o] of Object.entries(byCh)) {
      console.log(`${c}장 (${o.n}판 · 짐 ${o.lost})`);
      console.log(`  입구 피해 몫 전체: ${top(o.door, o.n)}`);
      if (o.lost) console.log(`  입구 피해 몫 진 판: ${top(o.doorL, o.lost)}`);
      console.log(`  쓰러짐 게이지 몫 전체: ${top(o.kd, o.n)}`);
      if (o.lost) console.log(`  쓰러짐 게이지 몫 진 판: ${top(o.kdL, o.lost)}`);
    }
  }
  // ── 전투력 보정 (node scripts/lb-balance.js powercalib [--seeds=3] [--list=21,...] [--fm=8] [--only=a,b])
  //  화면 전투력(POWER_BASE)을 정하는 측정: 정해 둔 동료 3명(강화 fm) + 시험 멤버 1명(+0 · ★1 · 장비 없음)으로 여러 스테이지
  //  점수 = 이기면 1 + 남은 입구, 지면 깬 웨이브 비율 · 같은 판을 '건전남 + 공격 장비 k' 로도 돌려
  //  "건전남 +0 의 몇 배 공격력과 같은 도움인가"(= 환산 배수)로 바꾼다 — 딜러 · 탱커 · 힐러를 한 잣대로
  let SKSTAT = null; // --skstat: 시험 멤버 스킬 횟수 · 기세 부족 · 피해 몫
  function powercalib() {
    const N = opt('seeds', 3), plus = opt('meta', 2);
    const list = listArg('list', '12,14,16,18,20,22,24,26,28,30,32,34,36,38,40,42,44,46,48,50').map(Number);
    const mOf = (s) => REC[D.chapterOf(s) - 1] + plus; // 모두 같은 강화 (장 권장 + plus) — 시험 멤버도 같이
    const TEAMS = [['eunok', 'myunghoon', 'sanghwa'], ['donghan', 'youngjun', 'gunnyeo']];
    const SUB = { eunok: 'sunggu', myunghoon: 'hanna', sanghwa: 'hanna', donghan: 'sunggu', youngjun: 'hanna', gunnyeo: 'dohoon' };
    const REFK = [0, 0.6, 1.3, 2.2, 3.5];
    const score = (r) => (r.win ? 1 + r.hp : (r.g.stats.wavesCleared || 0) / Math.max(1, r.g.totalWaves));
    function run(x, gearX) {
      let tot = 0, n = 0;
      for (const team0 of TEAMS) {
        const team = team0.map((y) => (y === x ? SUB[y] : y));
        const ids = [...team, x];
        const gear = Object.fromEntries(team.map((y) => [y, {}])); gear[x] = gearX || {};
        for (const s of list) for (let i = 1; i <= N; i++) {
          const meta = Object.fromEntries(ids.map((y) => [y, mOf(s)]));
          const r = play({ stage: s, deck: placeDeck(ids), partner: team[0], leader: team[0], meta, gear, items: itemsAt(s), seed: i * 173 + s * 11, unlocked: [], skills: true, control: true, join: true, tempo: true, stars: {}, onEvents: SKSTAT ? (g, evs) => { for (const e of evs) if (e.hero === x && (e.type === 'skill' || e.type === 'noMomentum')) SKSTAT[e.type] = (SKSTAT[e.type] || 0) + 1; } : undefined });
          if (SKSTAT) { SKSTAT.n = (SKSTAT.n || 0) + 1; SKSTAT.t = (SKSTAT.t || 0) + r.t; const hh = r.heroes[x]; if (hh) SKSTAT.dmg = (SKSTAT.dmg || 0) + hh.dmg / Math.max(1, r.dmg); SKSTAT.win = (SKSTAT.win || 0) + (r.win ? 1 : 0); SKSTAT.hp = (SKSTAT.hp || 0) + (r.win ? r.hp : 0); }
          tot += score(r); n++;
        }
      }
      return tot / n;
    }
    // --ref=빈자리,k0,k1,... : 기준 곡선을 이미 쟀으면 다시 안 돌린다
    const refArg = listArg('ref', '').map(Number), haveRef = refArg.length === REFK.length + 1;
    const ref = haveRef ? REFK.map((k, i) => [k, refArg[i + 1]]) : REFK.map((k) => [k, run('gunman', { atk: k })]);
    const zz = haveRef ? refArg[0] : run('zz');
    console.log(`\n■ 전투력 보정 — 모두 강화 장 권장+${plus} · 스테이지 ${list.join(',')} · ${N}판 × 팀 ${TEAMS.length}`);
    console.log('빈자리 ' + zz.toFixed(3) + ' · 기준(건전남 공격 +k): ' + ref.map(([k, v]) => `+${k} ${v.toFixed(3)}`).join(' · '));
    // 점수 → 환산 배수: 기준 곡선(건전남 공격 ×(1+k))은 갈수록 완만해서 (판을 이기는 데 피해는 점점 덜 중요) 로그로 맞춘다
    //  점수 = c + s·ln(배수) (최소제곱) → 배수 = exp((점수 − c) / s) · 그보다 낮으면 빈자리(0) ~ 1 사이 직선
    const X = ref.map(([k]) => Math.log(1 + k)), Y = ref.map(([, v]) => v), mx = X.reduce((a, b) => a + b, 0) / X.length, my = Y.reduce((a, b) => a + b, 0) / Y.length;
    const sl = Math.max(1e-3, X.reduce((a, x, i) => a + (x - mx) * (Y[i] - my), 0) / X.reduce((a, x) => a + (x - mx) ** 2, 0)), c0 = my - sl * mx;
    console.log(`기준 곡선: 점수 = ${c0.toFixed(3)} + ${sl.toFixed(3)}·ln(배수)`);
    const equiv = (v) => (v >= c0 ? Math.exp((v - c0) / sl) : Math.max(0, (v - zz) / Math.max(1e-3, c0 - zz)));
    const only = listArg('only', '');
    const ids = (only.length ? only : Object.keys(D.HEROES)).filter((id) => id !== 'zz');
    // --vars=atk:0.5,cd:0.35 : 장비 가치 — 멤버마다 맨몸 · 그 능력치 하나만 끼고 같은 판들 → 능력치 1.0 당 전투력(환산 배수)이 몇 % 오르나
    const vars = listArg('vars', '').map((kv) => { const [k, v] = kv.split(':'); return [k, Number(v)]; });
    if (vars.length) {
      const gv = {};
      for (const id of ids) {
        const e0 = equiv(run(id)), row = { base: +e0.toFixed(3) };
        for (const [k, v] of vars) row[k] = +((equiv(run(id, { [k]: v })) / Math.max(0.05, e0) - 1) / v).toFixed(3);
        gv[id] = row;
        console.log(pad(NAME[id] || id, 10) + pad(D.heroRole(id), 9) + `맨몸 ×${e0.toFixed(2)} · ` + vars.map(([k]) => `${k} ${row[k]}`).join(' · '));
      }
      console.log('GEARJSON ' + JSON.stringify(gv));
      return;
    }
    const out = {};
    for (const id of ids) {
      if (args.includes('--skstat')) SKSTAT = {};
      const v = id === 'gunman' && !SKSTAT ? ref[0][1] : run(id);
      out[id] = +equiv(v).toFixed(3);
      const k = SKSTAT, st = k ? `  · 스킬 ${((k.skill || 0) / k.n).toFixed(1)}번/판 (${((k.skill || 0) / (k.t / 60)).toFixed(2)}/분) · 기세 부족 ${((k.noMomentum || 0) / k.n).toFixed(1)} · 피해 몫 ${Math.round((k.dmg / k.n) * 100)}% · 클리어 ${Math.round((k.win / k.n) * 100)}% · 남은 입구 ${Math.round((k.hp / Math.max(1, k.win)) * 100)}%` : '';
      SKSTAT = null;
      console.log(pad(NAME[id] || id, 10) + pad('T' + D.heroTier(id), 4) + pad(D.heroRole(id), 9) + pad(v.toFixed(3), 8) + '× ' + out[id].toFixed(2) + st);
    }
    console.log('JSON ' + JSON.stringify(out));
  }
  if (what === 'powercalib') powercalib();
  if (what === 'custom') custom();
  if (what === 'deck') deck();
  if (what === 'attr') attrDecks();
  if (what === 'ch7calib' || what === 'ch8calib') ch7calib(); // ch8calib --list=71,72,...
  if (what === 'ch7') ch7();
  if (what === 'ch8') ch7(8); // 8장 결혼식 뒤풀이 (같은 덱 성향표 · node scripts/lb-balance.js ch8 [--seeds=N] [--list=71,75] [--prof=3,10])
  if (what === 'calib') calib();
  if (what === 'final') final();
  if (what === 'innate') innate();
  if (what === 'matchups') matchups();
  if (what === 'run20') run20();
  if (what === 'speed') {
    const r = play({ stage: 15, partner: 'gunman', meta: { bangjang: 6, gunman: 6 }, seed: 1 });
    console.log('1판', r.win, r.stars, r.t.toFixed(0) + 's', r.steps, 'steps', (Date.now() - t0) + 'ms');
  }
  if (what === 'all' || what === 'curve') curve();
  if (what === 'all' || what === 'stages') stages();
  if (what === 'all' || what === 'campaign') campaign();
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}초)`);
})().catch((e) => { console.error(e); process.exit(1); });
