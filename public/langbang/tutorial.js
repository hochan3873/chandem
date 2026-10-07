// 처음 하는 사람 튜토리얼: 방장이 말풍선(꼬리가 가리키는 곳)으로 알려 주고 · 손가락이 할 동작(탭 · 밀기)을 보여 준다
//  · 레슨 = 말풍선 몇 개(비트). 비트는 "그 일이 생겼을 때"(when) 뜨고 "플레이어가 직접 해야"(on 이벤트 · ok 상태 · 대상 탭) 넘어간다
//  · 전투 중 설명할 땐 판을 멈추거나(hold 0) 느리게(hold 0.3) — 카드 · 증강 제한 시간도 같이 멈춘다 (game.js 가 hold() 를 본다)
//  · 대상이 안 보이면 잠깐 기다렸다가 그 비트는 건너뛴다 (화면을 절대 막아 두지 않게) · 언제든 [건너뛰기]
//  · 기록: 기기(localStorage · 계정마다) + 로그인은 서버 프로필 tut (같은 목록)
//  · 레슨 고르기 · 비트 넘기기 · 기록 다루기는 DOM 없이 돈다 (test/langbang-tutorial.test.js)

export const TUT_LS = 'langbang:tutor:';
const ID_RE = /^@?[a-z0-9_-]{1,16}$/;
const MAX_IDS = 48;

// ─── 기록 ───
//  { on: 처음부터 배우는 중(클리어 0 에서 시작했거나 다시 보기) · off: 전부 끔 · done: { 레슨: 1 } }
export function tutNew() { return { on: false, off: false, done: {} }; }
// 서버 · 기기에 저장하는 모양: 문자열 목록 ('@on' · '@off' · 끝낸 레슨 id)
export function tutList(st) {
  const out = [];
  if (st.on) out.push('@on');
  if (st.off) out.push('@off');
  for (const k of Object.keys(st.done || {})) if (st.done[k] && ID_RE.test(k) && k[0] !== '@') out.push(k);
  return out.slice(0, MAX_IDS);
}
export function tutFromList(list) {
  const st = tutNew();
  if (!Array.isArray(list)) return st;
  for (const k of list.slice(0, MAX_IDS)) {
    if (typeof k !== 'string' || !ID_RE.test(k)) continue;
    if (k === '@on') st.on = true; else if (k === '@off') st.off = true; else if (k[0] !== '@') st.done[k] = 1;
  }
  return st;
}
export function tutParse(raw) { try { return tutFromList(JSON.parse(raw)); } catch { return tutNew(); } }
// 기기 기록 + 서버 기록 합치기 (둘 중 하나라도 본 건 본 것)
export function tutMerge(a, b) {
  const st = tutNew();
  st.on = !!(a.on || b.on); st.off = !!(a.off || b.off);
  st.done = Object.assign({}, a.done, b.done);
  return st;
}
// 처음 온 사람(클리어 0)이면 배우기 시작 — 이미 꺼 뒀거나 한 번이라도 시작했으면 그대로
export function tutEnroll(st, p) {
  if (st.on || st.off || Object.keys(st.done).length) return false;
  if ((p && p.maxStage) | 0) return false;
  st.on = true;
  return true;
}
// 설정 → 튜토리얼 다시 보기
export function tutReplay() { const st = tutNew(); st.on = true; return st; }
export const isDone = (st, id) => !!(st.done && st.done[id]);

// ─── 레슨 ───
//  c (지금 상황 · game.js 의 tutCtx): where('menu'|'prep'|'play'|'tower'|'raid'|…) · stage · mode · hell · pvp · lobby · prepStage · maxStage
//   · t · enemies · kills · cards · aug · aim · skillReady · skillTarget · ultReady · speedOk · kdHi · sup · baul · mail · checkin · upg · lack · blocked
//  레슨: { id, need:'on'(처음 배우는 사람만) | 'any', after:[먼저 끝낼 레슨], when(c), react(다른 레슨 중간에 끼어들 수 있음), scope(c)(벗어나면 그만), also:[같이 끝낸 걸로] }
//  비트: { id, say, at(대상: 셀렉터 | {f:'enemy'|'hero'|'field', id}), point(손가락만 그 안의 하나에), hand('tap'|'swipe'|'down'|null), hold(0|0.3|1 · 20초 뒤엔 풀림), dim,
//         when(c) · skip(c, seen) · 넘어가기: on(이벤트) | ok(c, c0) | tap('target'|'bubble') | wait(초) }
const play = (c) => c.where === 'play';
const stageRun = (c) => play(c) && c.mode === 'stage' && !c.hell && !c.pvp;
const calm = (c) => !c.cards && !c.aug && !c.aim;
export const SUP_TIPS = {
  gunnyeo: '<b>건전녀</b>는 서포터! 멤버들 <b>쓰러짐 게이지</b>를 계속 내려 주고, 응급 방패로 쓰러진 멤버를 바로 일으켜요',
  jungmin: '<b>홍정민</b>은 서포터! 팀 전체 <b>독 면역</b> · 입구도 고쳐 줘요',
  dohoon: '<b>김도훈</b>은 서포터! 떼창으로 팀 전체 <b>기절 시간 절반</b>',
  soyoung: '<b>정소영</b>은 서포터! 잔소리로 팀 전체 <b>홀림 면역</b>',
};
export const LESSONS = [
  // ── 처음: 로비 → 출전 준비 → 1-1 ──
  { id: 'start', need: 'on', when: (c) => c.where === 'menu' && c.lobby === 1, scope: (c) => c.where === 'menu', beats: [
    { id: 'hi', say: '반가워요! 저는 랑방 <b>방장</b>이에요.<br>진상들이 우리 아지트 랑방으로 몰려와요. 같이 막아 봐요!', hold: 0, tap: 'bubble' },
    { id: 'go', at: '.lb-start', hand: 'tap', say: '<b>출격!</b> 을 눌러요', hold: 0, tap: 'target' },
  ] },
  { id: 'start2', need: 'on', when: (c) => c.where === 'prep' && c.prepStage === 1, scope: (c) => c.where === 'prep', beats: [
    { id: 'go', at: '.pp-gobtn2', hand: 'tap', say: '덱은 제가 짜 놨어요.<br>바로 <b>출격!</b>', hold: 0, tap: 'target' },
  ] },
  { id: 'b1', need: 'on', when: (c) => stageRun(c) && c.stage === 1, scope: play, beats: [
    { id: 'door', at: '.base-hp', hand: 'tap', say: '이게 우리 <b>랑방 입구</b>예요.<br>진상들이 입구를 다 부수면 <b>져요!</b> 눌러서 확인!', hold: 0, tap: 'target' },
    { id: 'foe', when: (c) => c.enemies > 0 && !c.cards && !c.aug, at: { f: 'enemy' }, hand: 'tap', say: '진상이 <b>위에서 내려와요</b>.<br>진상을 <b>탭</b>하면 모두가 그 진상부터 때려요!', hold: 0, on: 'focus' },
    { id: 'auto', when: (c) => !c.cards && !c.aug, at: { f: 'hero' }, say: '멤버는 <b>알아서 공격</b>해요.<br>진상을 잡으면 경험치가 쌓여 <b>레벨업!</b>', hold: 1, dim: false, tap: 'bubble', wait: 6 },
  ] },
  // 판 중간에 끼어드는 것: 증강 · 레벨업 카드
  { id: 'aug', need: 'on', react: true, when: (c) => play(c) && c.aug, scope: play, beats: [
    { id: 'pick', at: '.aug-box .ab-list', point: '.aug-box [data-aug]', hand: 'tap', say: '<b>증강</b>이에요! 셋 중 <b>하나</b>를 골라요.<br>이번 판 내내 세져요', hold: 0, ok: (c) => !c.aug },
  ] },
  { id: 'cards', need: 'on', react: true, when: (c) => play(c) && c.cards && !c.aug, scope: play, beats: [
    { id: 'pick', at: '#cardstrip .card-list', point: '#cardstrip [data-act="pick"]', hand: 'tap', say: '<b>레벨업!</b> 카드 <b>한 장</b>을 골라요.<br>새 멤버가 합류하거나 멤버가 세져요', hold: 0, ok: (c) => !c.cards, on: 'card' },
  ] },
  { id: 'speed', need: 'on', after: ['b1'], when: (c) => stageRun(c) && c.speedOk && c.t > 25 && calm(c), scope: play, beats: [
    { id: 'tap', at: '#btn-speed', hand: 'tap', say: '답답하면 <b>×2</b>! 누르면 두 배로 빨라져요<br><small>한 번 더 누르면 다시 ×1</small>', hold: 0, on: 'speed', tap: 'target' },
  ] },
  // ── 1-2: 스킬 (쿨타임 고리) · 찍는 스킬 · 총공지 ──
  { id: 'skill', need: 'on', after: ['b1'], when: (c) => stageRun(c) && c.stage >= 2 && c.skillReady && calm(c), scope: play, beats: [
    { id: 'btn', at: '#skillbar .sk.ready', hand: 'tap', say: '<b>스킬</b> 준비 완료! 반짝이는 버튼을 눌러요', hold: 0, on: 'skillBtn', tap: 'target' },
    { id: 'aim', when: (c) => c.aim, skip: (c, seen) => seen.has('cast'), at: { f: 'field' }, hand: 'tap', say: '이 스킬은 <b>직접 찍어서</b> 써요.<br>진상이 <b>몰린 곳</b>을 탭!', hold: 0.3, dim: false, on: 'cast', maxWait: 6 },
    { id: 'cd', at: '#skillbar .sk:not(.ready)', say: '버튼 둘레 <b>고리</b>가 다시 차면 또 쓸 수 있어요 (쿨타임)<br><small>스킬마다 총공지 둘레 <b>기세</b> 1칸을 써요</small>', hold: 1, dim: false, tap: 'bubble', wait: 5, maxWait: 3 },
  ] },
  { id: 'ult', need: 'on', after: ['b1'], when: (c) => stageRun(c) && c.stage >= 2 && c.ultReady && calm(c), scope: play, beats: [
    { id: 'tap', at: '#btn-ult', hand: 'tap', say: '<b>총공지</b> 준비 완료!<br>누르면 멤버 모두가 한꺼번에 필살 공격!', hold: 0, on: 'ult', tap: 'target' },
  ] },
  // ── 1-3: 별 · 쓰러짐 게이지 ──
  { id: 'b3', need: 'on', after: ['b1'], also: ['kd'], when: (c) => stageRun(c) && c.stage === 3 && c.t > 1, scope: play, beats: [
    { id: 'stars', at: '#h-stars', hand: 'tap', say: '입구 체력을 지킬수록 <b>별 ★★★</b>!<br>별을 모으면 상자 · 보상이 열려요', hold: 0, tap: 'target' },
    { id: 'kd', when: (c) => c.enemies > 0 && !c.cards && !c.aug, at: { f: 'hero' }, hand: 'tap', say: '멤버도 진상에게 시달리면 <b>쓰러짐 게이지</b>가 차요. 꽉 차면 4초 <b>쓰러져요!</b><br>멤버를 눌러 보세요', hold: 0, on: 'hero' },
    { id: 'sup', skip: (c) => !!c.sup, say: '<b>서포터</b> 멤버(건전녀 · 홍정민 · 김도훈 · 정소영)를 덱에 넣으면 게이지를 내려 주고 상태이상을 막아 줘요', hold: 1, dim: false, tap: 'bubble', wait: 6 }, // 서포터가 판에 있으면 그 멤버 안내(sup)가 대신
  ] },
  // ── 누구나 처음 볼 때 한 번 (짧게) ──
  { id: 'kd', need: 'any', when: (c) => play(c) && !c.pvp && c.mode !== 'other' && c.kdHi >= 0.5 && calm(c), scope: play, beats: [
    { id: 'kd', at: { f: 'hero', kd: true }, say: '멤버 <b>쓰러짐 게이지</b>가 차고 있어요! 꽉 차면 4초 동안 공격 · 스킬을 못 해요<br><small>서포터 · 강화로 버텨요</small>', hold: 0.3, dim: false, tap: 'bubble', wait: 6 },
  ] },
  { id: 'sup', need: 'any', when: (c) => play(c) && !c.pvp && c.mode !== 'other' && (c.stage >= 3 || c.maxStage >= 3) && !!c.sup && c.t > 4 && calm(c), scope: play, beats: [
    { id: 'sup', at: { f: 'hero', sup: true }, say: (c) => SUP_TIPS[c.sup] || '서포터 멤버예요!', hold: 0.3, dim: false, tap: 'bubble', wait: 7 },
  ] },
  { id: 'baul', need: 'any', when: (c) => play(c) && !c.pvp && c.mode !== 'other' && c.baul && c.t > 1 && calm(c), scope: play, beats: [
    { id: 'ride', when: (c) => c.enemies > 0 && !c.cards && !c.aug, at: { f: 'enemy' }, hand: 'tap', say: '<b>송바울</b>은 직접 조종해요!<br>진상 쪽을 <b>탭</b>하면 보드를 타고 그리로 돌진!', hold: 0, on: 'board', maxWait: 20 },
    { id: 'more', say: '보드 충전은 <b>3칸</b> · 착지할 때 맞춰 탭하면 <b>퍼펙트!</b>', hold: 1, dim: false, tap: 'bubble', wait: 6 },
  ] },
  { id: 'pvp', need: 'any', when: (c) => play(c) && c.pvp && c.t > 2 && calm(c), scope: play, beats: [
    { id: 'a', when: calm, say: '<b>1:1 대전!</b> 두 사람에게 같은 진상이 와요.<br>입구가 <b>먼저 무너지는 쪽</b>이 져요', hold: 1, dim: false, tap: 'bubble', wait: 6 },
    { id: 'b', when: calm, at: '#oppstrip', say: '위에 <b>상대 상황</b>이 보여요. 총공지 · 스킬 타이밍으로 이겨요!', hold: 1, dim: false, tap: 'bubble', wait: 6, maxWait: 2 },
  ] },
  { id: 'tower', need: 'any', when: (c) => c.where === 'tower', scope: (c) => c.where === 'tower', beats: [
    { id: 'a', say: '<b>진상의 탑</b>! 멤버 <b>3명 파티</b>로 한 층씩 올라가요', hold: 1, tap: 'bubble' },
    { id: 'b', say: '바닥에 <b>빨간 예고</b>가 뜨면 멤버를 <b>끌어서</b> 피해요. 높이 갈수록 보상이 커져요', hand: null, hold: 1, tap: 'bubble' },
  ] },
  { id: 'raid', need: 'any', when: (c) => c.where === 'raid', scope: (c) => c.where === 'raid', beats: [
    { id: 'a', say: '<b>건물주 레이드</b>! 일주일 동안 모두가 함께 거대 보스 체력을 깎아요', hold: 1, tap: 'bubble' },
    { id: 'b', say: '입장 횟수가 정해져 있어요. <b>가장 센 덱</b>으로 · 보스 패턴 예고를 보고 피해요', hold: 1, tap: 'bubble' },
  ] },
  // ── 첫 클리어 뒤: 로비 · 강화 · 출전 준비 · 우편 · 출석 ──
  { id: 'lobby', need: 'on', after: ['b1'], when: (c) => c.where === 'menu' && c.maxStage >= 1, scope: (c) => c.where === 'menu', beats: [
    { id: 'win', say: '첫 클리어 축하해요! 🎉<br>이제 랑방을 같이 둘러봐요', hold: 0, tap: 'bubble' },
    { id: 'swipe', at: '.lb-dio .dio-track', hand: 'swipe', say: '옆으로 <b>밀면</b> 다른 스테이지를 볼 수 있어요', hold: 0, ok: (c, c0) => c.lobby !== c0.lobby, maxWait: 4 },
  ] },
  { id: 'upg', need: 'on', after: ['lobby'], when: (c) => c.where === 'menu' && c.upg, scope: (c) => c.where === 'menu', beats: [
    { id: 'go', at: '.lb-upg', hand: 'tap', say: '코인 · 카드가 모였어요! <b>강화</b>하면 멤버가 세져요.<br>같이 해 볼까요?', hold: 0, tap: 'target' },
  ] },
  { id: 'prep', need: 'on', after: ['b1'], when: (c) => c.where === 'prep' && c.maxStage >= 1, scope: (c) => c.where === 'prep', beats: [
    { id: 'pow', at: '.pp-pow', say: '<b>내 전투력</b>과 <b>권장 전투력</b>을 비교해요.<br>모자라면 강화하고 오기!', hold: 0, tap: 'bubble' },
    { id: 'lack', when: (c) => c.lack, skip: (c) => !c.lack, at: '.pp-lack', say: '<b>상성 경고</b>: 이 판 진상을 상대할 멤버가 없을 때 추천 멤버를 알려 줘요', hold: 0, tap: 'bubble' },
    { id: 'deck', at: '.pp-auto', say: '<b>덱 편집</b>에서 멤버를 바꿀 수 있어요', hold: 0, tap: 'bubble' },
    { id: 'go', at: '.pp-gobtn2', hand: 'tap', say: '준비됐으면 <b>출격!</b>', hold: 0, tap: 'target' },
  ] },
  { id: 'mail', need: 'on', after: ['lobby'], when: (c) => c.where === 'menu' && c.maxStage >= 2 && c.mail > 0, scope: (c) => c.where === 'menu', beats: [
    { id: 'open', at: '.lb-quick [data-act="mail"]', hand: 'tap', say: '<b>우편</b>에 선물이 왔어요! 눌러서 열어요', hold: 0, tap: 'target' },
    { id: 'get', at: ['.mail-pop [data-act="mailGet"][data-id="all"]', '.mail-pop [data-act="mailGet"]'], hand: 'tap', say: '<b>받기</b>를 눌러요! 선물은 7일 안에 받아야 해요', hold: 0, tap: 'target', maxWait: 4, modal: true },
  ] },
  { id: 'checkin', need: 'on', after: ['lobby'], when: (c) => c.where === 'menu' && c.maxStage >= 2 && c.checkin, scope: (c) => c.where === 'menu', beats: [
    { id: 'menu', at: '.lb-side.r', hand: 'tap', say: '매일 <b>출석</b>하면 선물! <b>메뉴</b>를 눌러요', hold: 0, tap: 'target' },
    { id: 'ck', at: '.mg-sheet [data-act="checkin"]', hand: 'tap', say: '<b>출석</b>을 눌러요', hold: 0, tap: 'target', maxWait: 4, modal: true },
    { id: 'do', at: '[data-act="doCheckin"]:not([disabled])', hand: 'tap', say: '<b>출석하기!</b>', hold: 0, tap: 'target', maxWait: 4, modal: true },
  ] },
];
const BY_ID = Object.fromEntries(LESSONS.map((l) => [l.id, l]));
export const lessonById = (id) => BY_ID[id] || null;

// 지금 시작할 레슨 (없으면 null) · reactOnly: 다른 레슨이 기다리는 동안 끼어들 것만
export function pickLesson(st, c, reactOnly = false) {
  if (!st || st.off || !c || c.blocked || c.modal) return null;
  for (const l of LESSONS) {
    if (reactOnly && !l.react) continue;
    if (isDone(st, l.id)) continue;
    if (l.need === 'on' && !st.on) continue;
    if (l.after && !l.after.every((a) => isDone(st, a))) continue;
    let ok = false; try { ok = !!l.when(c); } catch { ok = false; }
    if (ok) return l;
  }
  return null;
}
// 비트 i 부터 건너뛸 것을 넘기고 다음 비트 번호 (끝이면 -1)
export function nextBeat(les, i, c, seen) {
  for (let k = i; k < les.beats.length; k++) {
    const b = les.beats[k];
    let sk = false; try { sk = !!(b.skip && b.skip(c, seen)); } catch { sk = false; }
    if (!sk) return k;
  }
  return -1;
}
// 비트가 끝났나: 이벤트 · 상태 · 탭 · 시간
export function beatDone(b, c, seen, c0, tapped, shownSec) {
  if (b.on && seen.has(b.on)) return true;
  if (b.ok) { try { if (b.ok(c, c0 || {})) return true; } catch { /* 무시 */ } }
  if (b.tap && tapped) return true;
  if (b.wait && shownSec >= b.wait) return true;
  return false;
}
// 레슨을 끝냈을 때 기록 (also 도 같이)
export function markLesson(st, les) {
  st.done[les.id] = 1;
  for (const a of les.also || []) st.done[a] = 1;
  return st;
}
export const beatText = (b, c) => (typeof b.say === 'function' ? b.say(c) : b.say) || '';

// ─── 화면 ───
//  o: { stage, ctx() → c, fieldRect(spec, c) → {x,y,w,h, px,py}(무대 좌표) | null, face() → html, save(list), onSkipAll(), toast(msg) }
export function createTutor(o) {
  const stage = o.stage;
  let st = tutNew(), key = '';
  let cur = null; // { les, i, seen:Set, c0, shown, shownAt, waitAt, tapped, el, rect }
  let under = null; // 끼어든 레슨 아래서 기다리는 레슨
  let layer = null, parts = null, timer = 0, raf = 0;
  const now = () => performance.now();
  const store = () => { try { localStorage.setItem(TUT_LS + key, JSON.stringify(tutList(st))); } catch { /* 무시 */ } try { o.save && o.save(tutList(st)); } catch { /* 무시 */ } };
  // 계정이 정해지면 (부팅 · 로그인 · 로그아웃): 기기 기록 + 서버 기록 → 처음 온 사람이면 시작
  function load(accountKey, serverList, profile) {
    key = String(accountKey || 'guest');
    let local = tutNew(); try { local = tutParse(localStorage.getItem(TUT_LS + key) || '[]'); } catch { /* 무시 */ }
    const before = JSON.stringify(tutList(local));
    st = tutMerge(local, tutFromList(serverList || []));
    const enrolled = tutEnroll(st, profile);
    if (enrolled || JSON.stringify(tutList(st)) !== before || (Array.isArray(serverList) && JSON.stringify(serverList.slice().sort()) !== JSON.stringify(tutList(st).slice().sort()))) store();
    stopNow();
  }
  const vis = (el) => { if (!el || !el.isConnected || el.closest('[hidden]') || el.closest('.tr-old')) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  const find = (sel) => { for (const q of [].concat(sel)) { let list = []; try { list = [...document.querySelectorAll(q)]; } catch { list = []; } const el = list.find(vis); if (el) return el; } return null; };
  const scaleK = () => { const sr = stage.getBoundingClientRect(); return { sr, k: sr.width / (stage.offsetWidth || sr.width) || 1 }; };
  function rectOf(el) { const { sr, k } = scaleK(), r = el.getBoundingClientRect(); return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k }; }
  function target(b, c) {
    if (!b.at) return { none: true };
    if (typeof b.at === 'object' && !Array.isArray(b.at)) { const r = o.fieldRect ? o.fieldRect(b.at, c) : null; return r ? { rect: r } : null; }
    const el = find(b.at);
    return el ? { el, rect: rectOf(el) } : null;
  }
  function ensureLayer() {
    if (layer && layer.isConnected) return;
    layer = document.createElement('div');
    layer.className = 'tutor';
    layer.innerHTML = `<div class="tu-ring"></div>${'<div class="tu-blk"></div>'.repeat(4)}<div class="tu-hand"><i class="tu-tapfx"></i><i class="tu-fin"></i></div>
      <div class="tu-say"><span class="tu-face">${o.face ? o.face() : ''}</span><div class="tu-txt"></div><i class="tu-tail"></i><button class="tu-skip" type="button">건너뛰기</button></div><div class="tu-ask" hidden><b>안내를 건너뛸까요?</b><button data-k="one">이것만 건너뛰기</button><button data-k="all">튜토리얼 끄기</button><button data-k="no">계속 볼래요</button><small>설정 → 튜토리얼 다시 보기로 언제든 다시</small></div>`;
    stage.appendChild(layer);
    parts = { ring: layer.querySelector('.tu-ring'), blk: [...layer.querySelectorAll('.tu-blk')], hand: layer.querySelector('.tu-hand'), say: layer.querySelector('.tu-say'), txt: layer.querySelector('.tu-txt'), tail: layer.querySelector('.tu-tail'), skip: layer.querySelector('.tu-skip'), ask: layer.querySelector('.tu-ask') };
    // 막힌 곳을 누르면: 말풍선이 살짝 흔들 (어디를 누를지 다시) · 말풍선만 읽는 비트면 아무 데나 눌러도 다음
    for (const bk of parts.blk) bk.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); if (cur && cur.shown && cur.b.tap === 'bubble') { cur.tapped = true; return; } nudge(); });
    parts.say.addEventListener('click', (ev) => { if (ev.target.closest('.tu-skip')) return; if (cur && cur.shown && cur.b.tap === 'bubble') { ev.stopPropagation(); cur.tapped = true; } });
    parts.skip.addEventListener('click', (ev) => { ev.stopPropagation(); parts.ask.hidden = false; layer.classList.add('tu-asking'); cur && (cur.asking = true); });
    parts.ask.addEventListener('click', (ev) => {
      const k = ev.target.closest('[data-k]'); ev.stopPropagation(); if (!k) return;
      parts.ask.hidden = true; layer.classList.remove('tu-asking'); if (cur) cur.asking = false;
      if (k.dataset.k === 'one' && cur) { finish(true); }
      else if (k.dataset.k === 'all') { st.off = true; store(); stopNow(); o.toast && o.toast('튜토리얼을 껐어요 · 설정에서 다시 볼 수 있어요'); }
    });
  }
  function nudge() { if (!parts) return; parts.say.classList.remove('nudge'); void parts.say.offsetWidth; parts.say.classList.add('nudge'); }
  // 대상 칸을 탭했는지 (진짜 동작은 그대로 지나간다 — 막지 않음)
  function onDown(ev) {
    if (!cur || !cur.shown || cur.b.tap !== 'target' || !cur.rect) return;
    const { sr, k } = scaleK(), x = (ev.clientX - sr.left) / k, y = (ev.clientY - sr.top) / k, r = cur.rect;
    if (x >= r.x - 6 && x <= r.x + r.w + 6 && y >= r.y - 6 && y <= r.y + r.h + 6) cur.tapped = true;
  }
  document.addEventListener('pointerdown', onDown, true);
  function hideBits() { if (layer) layer.classList.add('tu-hid'); }
  function show(b, tg, c) {
    ensureLayer();
    cur.shown = true; cur.everShown = true; cur.shownAt = now(); cur.tapped = false; cur.el = tg.el || null; cur.rect = tg.rect || null; cur.b = b;
    const n = cur.les.beats.length;
    parts.txt.innerHTML = `${n > 1 ? `<em class="tu-n">${cur.i + 1}/${n}</em>` : ''}<span>${beatText(b, c)}</span>${b.tap === 'bubble' ? '<small class="tu-go">눌러서 계속 ›</small>' : ''}`;
    const dim = b.dim !== false && b.hold === 0;
    layer.className = `tutor ${dim ? 'tu-dim' : 'tu-nodim'} ${tg.none ? 'tu-center' : ''} ${b.tap === 'bubble' ? 'tu-read' : ''}`;
    parts.hand.className = `tu-hand ${b.hand ? 'h-' + b.hand : 'off'}`;
    parts.say.classList.remove('pop'); void parts.say.offsetWidth; parts.say.classList.add('pop');
    cur.lastPos = '';
    place();
  }
  function place() {
    if (!cur || !cur.shown || !layer) return;
    const b = cur.b, W = stage.offsetWidth || 360, H = stage.offsetHeight || 720;
    // 대상이 움직이면 (진상 · 멤버 · 스크롤) 따라간다
    if (cur.el) { if (vis(cur.el)) cur.rect = rectOf(cur.el); }
    else if (b.at && typeof b.at === 'object' && !Array.isArray(b.at)) { const r = o.fieldRect && o.fieldRect(b.at, o.ctx()); if (r) cur.rect = r; }
    const r = cur.rect;
    const pad = 6;
    const pos = r ? `${r.x | 0},${r.y | 0},${r.w | 0},${r.h | 0}` : 'c';
    if (pos === cur.lastPos) return;
    cur.lastPos = pos;
    const { ring, blk, hand, say, tail } = parts;
    if (!r) {
      ring.style.cssText = 'display:none';
      for (const bk of blk) bk.style.cssText = 'left:0;top:0;width:0;height:0';
      Object.assign(blk[0].style, { left: 0, top: 0, width: W + 'px', height: H + 'px' });
      const bw = Math.min(W - 32, 300);
      say.style.cssText = `left:${(W - bw) / 2}px;top:${H * 0.36}px;width:${bw}px`;
      say.className = say.className.replace(/\b(up|dn)\b/g, '').trim();
      hand.style.display = 'none';
      return;
    }
    const x = r.x - pad, y = r.y - pad, w = r.w + pad * 2, h = r.h + pad * 2;
    ring.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${Math.min(22, h / 2)}px`;
    const [t, bo, l, rr] = blk;
    Object.assign(t.style, { left: 0, top: 0, width: W + 'px', height: Math.max(0, y) + 'px' });
    Object.assign(bo.style, { left: 0, top: y + h + 'px', width: W + 'px', height: Math.max(0, H - y - h) + 'px' });
    Object.assign(l.style, { left: 0, top: y + 'px', width: Math.max(0, x) + 'px', height: h + 'px' });
    Object.assign(rr.style, { left: x + w + 'px', top: y + 'px', width: Math.max(0, W - x - w) + 'px', height: h + 'px' });
    // 손가락: 대상 가운데(필드 대상은 표시된 점) · 말풍선: 대상이 위쪽이면 아래에, 아래쪽이면 위에 (꼬리가 대상 쪽)
    let px = r.px !== undefined ? r.px : x + w / 2, py = r.py !== undefined ? r.py : y + h / 2;
    if (b.point) { const pe = find(b.point); if (pe) { const q = rectOf(pe); px = q.x + q.w / 2; py = q.y + q.h / 2; } } // 여러 개 중 하나를 콕 (카드 · 증강)
    hand.style.display = '';
    hand.style.left = Math.max(4, Math.min(W - 44, px - 6)) + 'px'; hand.style.top = py - 4 + 'px';
    if (b.hand === 'swipe') hand.style.left = Math.min(W - 44, px + 40) + 'px'; // 오른쪽에서 왼쪽으로 민다
    const bw = Math.min(W - 24, 290);
    say.style.width = bw + 'px';
    const bh = say.offsetHeight || 80;
    const below = y + h / 2 < H * 0.5;
    let top = below ? y + h + 18 + (b.hand ? 34 : 0) : y - bh - 18;
    top = Math.max(8, Math.min(H - bh - 8, top));
    const left = Math.max(12, Math.min(W - bw - 12, px - bw / 2));
    say.style.left = left + 'px'; say.style.top = top + 'px';
    say.classList.toggle('up', below); say.classList.toggle('dn', !below); // up: 꼬리가 위(대상이 위에)
    tail.style.left = Math.max(18, Math.min(bw - 30, px - left - 9)) + 'px';
  }
  function loop() { raf = requestAnimationFrame(loop); try { place(); } catch { /* 무시 */ } }
  function begin(les, c) {
    cur = { les, i: -1, seen: new Set(), c0: c, shown: false, shownAt: 0, waitAt: now(), tapped: false, el: null, rect: null, b: null };
    advance(c, 0);
  }
  function advance(c, from) {
    if (!cur) return;
    if (layer) layer.classList.add('tu-hid');
    const k = nextBeat(cur.les, from, c, cur.seen);
    if (k < 0) return finish(false);
    cur.i = k; cur.b = cur.les.beats[k]; cur.shown = false; cur.waitAt = now(); cur.c0 = c; cur.tapped = false;
  }
  function finish(skipped) {
    if (!cur) return;
    markLesson(st, cur.les); store();
    cur = null;
    if (layer) layer.classList.add('tu-hid');
    if (under) { cur = under; under = null; cur.shown = false; cur.waitAt = now(); }
    void skipped;
  }
  function stopNow() { cur = null; under = null; if (layer) { layer.remove(); layer = null; parts = null; } }
  function tick() {
    if (!key) return; // 계정 기록을 읽기 전엔 아무것도 안 띄운다
    let c; try { c = o.ctx(); } catch { return; }
    if (!c) return;
    if (!cur) { const les = pickLesson(st, c); if (les) begin(les, c); else { if (layer) layer.classList.add('tu-hid'); return; } }
    if (!cur) return;
    // 먼저: 방금 한 동작으로 끝났나 (버튼을 누르자마자 화면이 바뀌어도 본 걸로)
    if (cur.shown && cur.b && beatDone(cur.b, c, cur.seen, cur.c0, cur.tapped, (now() - cur.shownAt) / 1000)) { advance(c, cur.i + 1); if (!cur) return; }
    // 레슨 자리를 벗어남 (판이 끝남 · 화면이 바뀜): 하나라도 보여 줬으면 본 걸로 (다시 졸라대지 않게)
    if (cur.les.scope && !cur.les.scope(c)) {
      const les = cur.les, started = cur.i > 0 || cur.shown || cur.everShown;
      cur = null; if (layer) layer.classList.add('tu-hid');
      if (under && (!under.les.scope || under.les.scope(c))) { cur = under; cur.shown = false; cur.waitAt = now(); }
      under = null;
      if (started) { markLesson(st, les); store(); }
      return;
    }
    const b = cur.b;
    if (!b) return finish(false);
    if (c.blocked || (c.modal && !b.modal)) { hideBits(); cur.shown = false; return; }
    if (cur.shown && b.when) { let still = true; try { still = !!b.when(c); } catch { still = false; } if (!still) { hideBits(); cur.shown = false; return; } } // 조건이 사라지면 (증강 · 카드가 떠서) 잠깐 숨었다가 다시
    if (!cur.shown) {
      let sk = false; try { sk = !!(b.skip && b.skip(c, cur.seen)); } catch { sk = false; }
      if (sk) return advance(c, cur.i + 1);
      let ready = true; try { ready = !b.when || !!b.when(c); } catch { ready = false; }
      if (ready) {
        if (b.on && cur.seen.has(b.on)) return advance(c, cur.i + 1); // 이미 해 봤다 (먼저 진상을 탭했으면)
        const tg = target(b, c);
        if (tg) { show(b, tg, c); return; }
        if (now() - cur.waitAt > (b.maxWait || 4) * 1000) return advance(c, cur.i + 1); // 대상이 안 보임: 건너뛴다
        return;
      }
      // 조건을 기다리는 동안: 증강 · 카드 같은 건 먼저 알려 준다
      if (!under) { const r = pickLesson(st, c, true); if (r && r !== cur.les) { under = cur; begin(r, c); return; } }
      if (now() - cur.waitAt > (b.maxWait || 40) * 1000) return advance(c, cur.i + 1);
      return;
    }
    if (layer) layer.classList.remove('tu-hid');
    // 대상이 사라짐 (화면이 바뀜 · 버튼이 없어짐): 잠깐 뒤 다음으로
    if (cur.el && !vis(cur.el)) { const el = find(b.at); if (el) cur.el = el; else if (!cur.goneAt) cur.goneAt = now(); else if (now() - cur.goneAt > 1500) { cur.goneAt = 0; return advance(c, cur.i + 1); } }
    else cur.goneAt = 0;
  }
  function holding() { return !!(cur && cur.shown && cur.b && layer && !layer.classList.contains('tu-hid') && now() - cur.shownAt < (cur.b.relax || 20) * 1000); }
  function startLoop() { if (!timer) timer = setInterval(tick, 160); if (!raf) raf = requestAnimationFrame(loop); }
  startLoop();
  return {
    load,
    emit: (name) => { if (cur) cur.seen.add(name); if (under) under.seen.add(name); },
    // 전투 시간 배율: 설명 중이면 멈춤(0) · 느리게(0.3)
    //  오래(20초) 아무것도 안 하면 다시 흐르게 (판이 영영 멈춰 있지 않게 · 카드 자동 선택도 다시)
    scale: () => (holding() ? cur.b.hold : 1),
    hold: () => holding() && cur.b.hold < 1,
    active: () => !!(cur && cur.shown),
    learning: () => !!(st.on && !st.off), // 처음 배우는 중 (예전 한 줄 팁은 끈다)
    state: () => tutList(st),
    now: () => (cur ? { les: cur.les.id, beat: cur.b && cur.b.id, shown: !!cur.shown, under: under ? under.les.id : null, seen: [...cur.seen] } : null), // (화면 찍기 스크립트 · 디버그)
    replay: () => { st = tutReplay(); store(); stopNow(); },
    stop: stopNow,
    tick,
  };
}
