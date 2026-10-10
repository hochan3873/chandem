// 랑방 대전 — 레벨업 카드를 쉬운 말로 (DOM 없이 · 테스트가 직접 부른다)
//  카드 이름(철갑탄 · 레드카드 퇴장 …)은 작은 부제로 두고, 앞에는 "무엇이 얼마나 바뀌나"를 숫자로 쓴다.
//  · cardPlain(c, g): { head 쉬운 한 줄 · name 원래 이름 · hero 주인 멤버 · q 「스킬」은? · ba 전→후 · more 나머지 효과 · good 좋은 판 · who 대상 멤버 }
//  · skillPlain(id): 멤버 스킬 · 기본 공격 한 줄 요약 (360px 카드에 들어가게 22자 이하)
import { HEROES, SUMMONS, SKILL_AUG, SKILL_EVO, TECH, TAGS, HERO_TAGS, ATTRS, CC_KINDS, CC_ON_HIT, EVO, EVO_MUL, HERO_CARDS, GROW, MOMENTUM, TEMPO, TOWER_AWAKE_FX } from './data.js';

// ─── 멤버 스킬 · 기본 공격 한 줄 요약 · 이런 판에 좋아요 · 낯선 낱말 풀이 ───
//  sk: 스킬 · atk: 기본 공격 · good: 좋은 판 · gl: [낱말, 뜻] (카드 설명에 이 낱말이 있으면 그걸 풀어 준다)
export const SKILL_PLAIN = {
  bangjang: { sk: '모두 밀쳐 내고 우리 편 공속 크게 ↑', atk: '찍은 진상을 모두가 더 세게 때림', good: '보스전 · 센 진상 하나 잡을 때', gl: [['지목', '방장이 찍은 진상 — 모두에게 더 아픔'], ['지시', '방장이 진상을 콕 찍는 기본 공격'], ['공지 오라', '곁 멤버 공격 속도를 올려 주는 기운'], ['오라', '곁 멤버 공격 속도를 올려 주는 기운']] },
  staff: { sk: '진상 하나를 뒤로 쫓아내고 기절', atk: '딱지 맞으면 느려지고 쌓이면 강퇴', good: '보호막 진상 · 앞줄 정리', gl: [['강퇴', '경고가 쌓인 진상을 기절시키고 밀어냄'], ['경고', '딱지 맞을 때마다 쌓임 (3번이면 강퇴)'], ['레드카드', '스킬 — 진상 하나를 쫓아내고 기절']] },
  gunman: { sk: '1.2초 동안 권총을 마구 연사', atk: '한 명씩 정확하게 쏘는 권총', good: '보스 · 멀리 있는 진상', gl: [['퀵드로우', '스킬 — 1.2초 동안 권총을 마구 연사'], ['헤드샷', '머리를 맞혀 아주 아픈 한 발'], ['관통', '한 발이 뒤 진상까지 뚫고 감']] },
  gunnyeo: { sk: '멤버 상태이상 풀고 잠깐 면역', atk: '작은 폭탄 + 틈틈이 멤버 간호', good: '기절 · 홀림 거는 진상 많은 판', gl: [['응급 방패', '스킬 — 멤버 상태이상 풀고 잠깐 면역'], ['방패', '스킬 — 멤버 상태이상 풀고 잠깐 면역'], ['간호', '멤버 상태이상을 틈틈이 풀어 줌'], ['하트 폭탄', '가까운 진상에게 던지는 작은 폭탄']] },
  myunghoon: { sk: '빠른 진상 5명에게 벼락 + 얼림', atk: '욕 번개가 3~5명을 튀며 얼림', good: '빠른 진상 많은 판', gl: [['벼락', '스킬 — 빠른 진상에게 떨어지는 벼락'], ['실눈 저격', '스킬 — 빠른 진상에게 떨어지는 벼락'], ['욕', '진상 사이를 튀는 욕 번개 (기본 공격)'], ['튕김', '번개가 옆 진상으로 옮겨 가는 수']] },
  dohoon: { sk: '무대 위 진상 멈춤 + 우리 편 공속↑', atk: '둥글게 퍼지는 음파로 여러 명', good: '떼거리 판 · 상태이상 많은 판', gl: [['앵콜', '스킬 — 무대 진상 멈춤 + 우리 편 공속↑'], ['앙코르', '스킬 — 무대 진상 멈춤 + 우리 편 공속↑'], ['음파', '둥글게 퍼지는 노래 고리 (기본 공격)'], ['떼창', '음파 맞힐수록 차는 게이지 → 모두 공속↑']] },
  ingyu: { sk: '오토바이로 돌며 진상 밖으로 튕김', atk: '덤벨 굴려 한 줄을 치고 밀침', good: '앞까지 몰려온 진상 밀어낼 때', gl: [['할리', '오토바이 — 달리며 진상을 튕겨 냄'], ['오토바이 덤벨', '덤벨 몇 번 굴리면 오토바이 돌진'], ['오토바이', '덤벨 몇 번 굴리면 나오는 돌진'], ['덤벨', '바닥에 굴려 한 줄을 치는 기본 공격']] },
  donghan: { sk: '진상 몰린 곳마다 하늘에서 연달아 쾅', atk: '과자 던지다 게이지 차면 한 줄 빔', good: '한 줄로 길게 오는 진상', gl: [['간보기 게이지', '과자 맞힐 때마다 참 → 가득 차면 빔'], ['간보기', '과자 맞힐 때마다 차는 빔 게이지'], ['빔', '한 줄을 통째로 쓸어버리는 빛줄기'], ['포격', '스킬 — 몰린 곳마다 하늘에서 떨어지는 한 방']] },
  youngjun: { sk: '최대 3명을 번개처럼 연속 베기', atk: '진상 사이를 뛰어다니며 베기', good: '몰려 있는 무리', gl: [['블랙 러시', '스킬 — 여러 명을 번개처럼 연속 베기'], ['돌격', '뛰어들어 베는 시간 (끝나면 쉼)'], ['크로스핏', '돌격 뒤 숨 고르는 쉬는 시간']] },
  eunok: { sk: '바로 분노 모드 (센 상태)', atk: '울며 소주잔 · 분노 땐 소주병 펑', good: '떼거리 판', gl: [['분노', '취하면 세지는 모드 — 술 웅덩이까지'], ['술 웅덩이', '밟으면 느려지는 술 자국'], ['원샷', '스킬 — 바로 분노 모드']] },
  hanna: { sk: '남자는 날리고 여자는 홀려 멈춤', atk: '한 명에게 쏠수록 세지는 레이저', good: '보스 · 체력 많은 진상', gl: [['윙크 폭탄', '스킬 — 남자는 날리고 여자는 홀림'], ['레이저', '한 명에게 쏠수록 세지는 기본 공격'], ['홀림', '잠깐 넋 놓고 멈춤']] },
  sunggu: { sk: '진상을 빨아 모아 마지막에 쾅', atk: '돌아오는 지팡이가 두 번 훑음', good: '떼거리 · 줄지어 오는 진상', gl: [['블랙홀', '스킬 — 진상을 빨아 모아 마지막에 쾅'], ['지팡이', '던지면 크게 돌아오는 부메랑']] },
  junseo: { sk: '여사친 하나 더 바로 내보냄', atk: '여사친이 핀볼처럼 튕기며 밀침', good: '떼거리 판 · 밀어내기', gl: [['소개팅', '스킬 — 여사친 하나 더 바로 내보냄'], ['여사친', '진상 사이를 튕겨 다니는 공 (기본 공격)'], ['튕김', '여사친이 옮겨 가며 맞히는 수']] },
  hyungyeong: { sk: '바로 날씬 모드 + 숨은 진상 표시', atk: '땅을 쿵! 한 줄 충격파로 밀침', good: '숨는 진상 나오는 판', gl: [['날씬 모드', '주사 맞고 빠른 잽을 날리는 센 모드'], ['표시', '표시된 진상은 모두에게 더 아픔'], ['다이어트 주사', '스킬 — 바로 날씬 모드']] },
  ara: { sk: '가장 센 적에게 거대 망치 한 방', atk: '센 진상부터 아주 무거운 한 방', good: '보스전', gl: [['공주로', '공주 상태 — 늙으면 힘이 반토막'], ['늙는', '가끔 할머니가 되어 약해지는 시간'], ['공주의 일격', '스킬 — 가장 센 적에게 망치 한 방'], ['공주', '공주 상태 — 늙으면 힘이 반토막']] },
  hochan: { sk: '버스로 전부 밀치고 기절 + 공격력↑', atk: '황금 파동이 한 줄을 휩씀', good: '위기 때 판 뒤집기', gl: [['랑방 버프', '맞힐 때마다 쌓이는 멤버 공격력 보너스'], ['막차', '스킬 — 버스 행렬로 전부 밀치고 기절'], ['버스', '스킬 — 버스 행렬로 전부 밀치고 기절']] },
  soyoung: { sk: '성준영 바로 불러 7초 강하게', atk: '직접 안 때림 — 성준영을 부림', good: '떼거리 판', gl: [['성준영', '소영이 부리는 친구 — 진상을 쓸어 담음'], ['준영', '소영이 부리는 친구 — 진상을 쓸어 담음'], ['올인', '준영이 더 넓고 세게 쓸어 담는 시간'], ['잔소리', '잔소리로 성준영 체력을 채움']] },
  jieun: { sk: '넓은 범위 진상을 크게 느리게', atk: '발밑 시계 — 지나는 진상 느려짐', good: '빠른 진상 · 떼거리', gl: [['시간 정지', '스킬 — 넓은 범위 진상을 크게 느리게'], ['시계침', '발밑에 뜨는 시계 — 지나면 느려짐'], ['시계', '발밑에 뜨는 시계 — 지나면 느려짐']] },
  sanghwa: { sk: '찍은 곳에 장미 꽃다발 폭발', atk: '장미 3송이 모이면 꽃다발 펑', good: '긴 판 · 무한 도전', gl: [['성장 한도', '판이 길수록 오르는 공격력의 최대치'], ['성장', '판이 길수록 올라가는 공격력'], ['꽃다발', '장미가 모이면 터지는 폭발']] },
  jungmin: { sk: '붕대 벽으로 막고 입구 수리', atk: '입구 앞 진상을 휘둘러 밀침', good: '입구가 자꾸 맞는 판', gl: [['수리', '입구 체력을 다시 채움'], ['바리케이드', '스킬 — 진상을 막아 세우는 붕대 벽'], ['붕대 벽', '스킬 — 진상을 막아 세우는 붕대 벽']] },
  jiwon: { sk: '3줄에 모자이크 손 쾅! 쾅! 쾅!', atk: '맞힐수록 진상 방어를 벗김', good: '단단한 철갑 진상', gl: [['방깎', '진상 방어를 깎아 모두에게 더 아프게'], ['모자이크 손', '진상을 내리치는 손 (스킬 · 기본 공격)'], ['모자이크', '진상을 내리치는 손 (스킬 · 기본 공격)']] },
  wonsik: { sk: '입구 앞을 막아서서 대신 맞음', atk: '입구 치는 진상에게 반격 펀치', good: '입구가 자꾸 맞는 판', gl: [['상담', '스킬 — 원식이 입구 앞을 막아섬'], ['피해 감소', '입구가 덜 아프게 맞음']] },
  baul: { sk: '점프대로 날아올라 착지 쾅', atk: '탭한 곳으로 보드 돌진 (직접)', good: '직접 조작이 좋을 때', gl: [['점프대', '스킬 — 날아올라 착지하며 쾅'], ['착지', '스킬 점프 뒤 내려앉는 곳'], ['보드', '탭한 곳으로 달려가는 기본 공격']] },
  byunghwa: { sk: '6초 동안 진상들이 춤추며 멈춤', atk: '진상을 조명 가운데로 모아 홀림', good: '떼거리 · 위기 탈출', gl: [['원맨쇼', '스킬 — 6초 동안 진상들이 춤추며 멈춤'], ['고함', '원맨쇼 무대에서 진상을 홀리는 외침'], ['홀림', '잠깐 넋 놓고 멈춤']] },
  jeongseob: { sk: '커져서 진상을 넓게 밀어냄', atk: '걸어가며 진상을 통째로 밀어냄', good: '앞줄이 밀려올 때', gl: [['벽 쿵쿵', '끝에서 쿵! 진상을 기절시킴'], ['미는 폭', '한 번에 밀어내는 너비'], ['쉬는 시간', '다 걸은 뒤 쉬는 시간']] },
  subin: { sk: '춤판 위 진상을 리본으로 묶음', atk: '리본으로 감아 제자리에 묶음', good: '빠른 진상 · 시간 벌기', gl: [['댄스 플로어', '스킬 — 박자마다 진상을 묶는 춤판'], ['감기', '리본에 감겨 잠깐 못 움직임'], ['감는', '리본에 감겨 잠깐 못 움직임'], ['리본', '진상을 감아 묶는 기본 공격']] },
  dragon: { sk: '용이 내리꽂혀 범위 큰 피해', atk: '불을 뿜어 여러 명에게 화상', good: '떼거리 판', gl: [['화상', '불 붙어 계속 아픔 (겹칠수록 세게)'], ['급강하', '스킬 — 용이 하늘에서 내리꽂힘'], ['불 바닥', '불이 남아 밟으면 아픈 바닥'], ['불길', '박나뇽이 뿜는 불 (기본 공격)']] },
};
// 멤버 전용 스킬 증강: 쉬운 한 줄 (없으면 data.js 설명 그대로)
export const AUG_PLAIN = {
  'bangjang:tri': '찍을 때 근처 2명도 같이 찍음', 'bangjang:rally': '집합! 3초 더 · 공속 +20%p 더', 'bangjang:loud': '사거리 +20% · 찍은 진상 +10%p',
  'staff:redchain': '레드카드 1장 더 날아감 (80%)', 'staff:warn2': '경고 2번만 맞아도 강퇴', 'staff:kickboom': '강퇴된 진상 주변 터지며 기절',
  'gunman:frenzy': '권총 연사 0.6초 더 · 피해 +20%', 'gunman:head': '치명타 +15% · 3발마다 헤드샷',
  'gunnyeo:aegis': '방패 면역 1.5초 더 · 쿨 1초 짧게', 'gunnyeo:angel': '간호 더 자주 · 폭탄 범위 +30%',
  'myunghoon:bolts': '스킬 벼락이 8발로 늘어남', 'myunghoon:chain': '번개가 2명 더 튐 · 기절 +30%',
  'dohoon:medley': '앵콜 버프 2배 길게 · 범위 +30%', 'dohoon:hi': '음파 범위 +25% · 4명 더 맞힘',
  'ingyu:twin': '오토바이가 반대쪽에 한 대 더', 'ingyu:booster': '오토바이 더 자주 · 피해 +50%',
  'donghan:double': '빔이 두 번째 줄에도 (70%)', 'donghan:fastmeter': '빔 게이지가 40% 빨리 참',
  'youngjun:rushx': '연속 베기 1명 더 · 피해 +30%', 'youngjun:endless': '베는 시간 1.5초 더 · 덜 쉼',
  'eunok:inferno': '술 웅덩이 범위 +50% · 1초 더', 'eunok:bottoms': '분노 4초 더 · 스킬 쿨 −30%',
  'hanna:focus': '레이저가 더 빨리 · 더 세게 강해짐', 'hanna:wbomb': '윙크 폭탄 범위 +35% · 홀림 길게',
  'sunggu:tricane': '지팡이 1개 더 던짐', 'sunggu:bighole': '블랙홀 범위 +35% · 마지막 쾅 +40%',
  'junseo:pinball': '여사친이 2명 더 튕김', 'junseo:jackpot': '스킬 여사친 1명 더 · 피해 +30%',
  'hyungyeong:noyoyo': '날씬 모드 5초 더 길게', 'hyungyeong:target': '표시한 진상 피해 +25% → +45%',
  'ara:forever': '공주 상태 6초 더 · 덜 늙음', 'ara:combo': '망치가 센 적 둘에게도 (60%)',
  'hochan:bond': '랑방 버프 최대치 +12%p', 'hochan:extra': '버스 2대 더 · 기절 0.5초 더',
  'soyoung:nagbomb': '성준영 체력 +40%', 'soyoung:allin': '준영 쓸어 담기 피해 +50% · 범위↑',
  'jieun:frozen': '시간 정지가 훨씬 느리게 · 범위↑', 'jieun:tick': '시계 감속 +15%p · 1초 더',
  'sanghwa:growth': '성장 최대치 +20%', 'sanghwa:perfect': '꽃다발 피해 +40% · 범위 +30%',
  'jungmin:craft': '입구 수리량 +50%', 'jungmin:iron': '붕대 벽 1.5배 튼튼 · 2초 더',
  'jiwon:deep': '방어 깎기 1겹 더 · 2초 더', 'jiwon:wide': '모자이크 손 폭 +50% · 피해 +40%',
  'wonsik:consult': '막아서는 범위 +40%', 'wonsik:back': '입구 피해 −10%p 더 · 범위 +25%',
  'baul:ice': '착지한 곳이 4초 빙판 (느려짐)', 'baul:twice': '착지 뒤 한 번 더 점프 (60%)', 'baul:glow': '보드 피해 +25% · 보드 폭 +40%',
  'byunghwa:curtain': '원맨쇼 중 잡으면 시간 연장', 'byunghwa:stage': '홀리는 진상 2명 더 · 0.3초 더',
  'subin:ribbon': '리본 묶는 시간 0.5초 더', 'subin:catch': '춤판 범위 +25% · 한 박자 더',
  'dragon:blaze': '화상 최대 5겹 · 불 바닥 1초 더', 'dragon:twin': '급강하 한 번 더 (60%)',
  'jeongseob:giant': '미는 폭 +30% · 버티는 힘 +50%', 'jeongseob:stomp': '끝의 쿵 기절 1초 더 · 범위↑', 'jeongseob:stride': '걷기 +30% · 쉬는 시간 −3초',
};
// 길(태그) 쉬운 이름: 관통 = 뚫는 공격 …
const TAG_PLAIN = { pierce: '뚫는 공격', splash: '폭발 공격', chain: '튕기는 공격', kb: '밀치는 공격', heal: '회복', ctrl: '묶고 느리게', boss: '보스 잡기' };
const TAG_GOOD = { pierce: '줄지어 오는 진상', splash: '떼거리 판', chain: '떼거리 판', kb: '입구 앞까지 몰려올 때', heal: '입구가 자꾸 맞는 판', ctrl: '빠른 진상 많은 판', boss: '보스전' };
// 공용 카드 쉬운 한 줄: n = 설명 속 숫자들 (큰 카드면 % 가 커진 그대로)
const GLOBAL_HEAD = {
  dmg: (n) => `모든 멤버 공격력 ${n[0]}`,
  spd: (n) => `모든 멤버 공격 속도 ${n[0]}`,
  gunExtra: () => '건전남 한 번에 1발 더',
  crit: (n) => `치명타(2배 피해) 확률 ${n[0]}`,
  hp: (n) => `입구 최대 체력 ${n[0]} · 절반 회복`,
  exp: (n) => `경험치 ${n[0]} (레벨업 빨리)`,
  slow: (n) => `모든 진상 걸음 ${n[0]}`,
  pierce: () => '모든 공격이 1명 더 뚫고 감',
  boss: (n) => `모든 멤버 공격력 ${n[0]} · 공속 ${n[1]}`,
  regen: (n) => `입구 체력 초당 ${n[0]} 회복`,
  ult: (n) => `총공지(확성기) 빨리 참 · 피해 ${n[1]}`,
  charmRes: (n) => `홀리는 시간 ${n[0]}`,
  debuffRes: (n) => `기절·홀림 덜 당함 (${n[0]})`,
  cdCut: (n) => `모든 스킬 더 자주 (쿨타임 ${n[0]})`,
  armor: (n) => `입구가 받는 피해 ${n[0]}`,
  attrUp: (n) => `상성 유리할 때 피해 ${n[0]}`,
  tag_pierce: (n) => `뚫는 공격 멤버 공격력 ${n[0]} · 1명 더 뚫음`,
  tag_splash: (n) => `폭발 범위 ${n[0]} · 폭발 멤버 공격력 ${n[1]}`,
  tag_chain: (n) => `튕기는 공격 1명 더 · 공격력 ${n[1]}`,
  tag_kb: (n) => `진상 더 멀리 밀침 ${n[0]} · 공격력 ${n[1]}`,
  tag_heal: (n) => `회복량 ${n[0]} · 회복 멤버 공격력 ${n[1]}`,
  tag_ctrl: (n) => `기절·느리게 ${n[0]} 길게 · 공격력 ${n[1]}`,
  tag_boss: (n) => `보스에게 주는 피해 ${n[0]}`,
  swarm: (n) => `보통 진상에게 피해 ${n[0]}`,
  risk_allin: (n) => `공격력 ${n[1]} 대신 입구 체력 ${n[0]}`,
  risk_overtime: (n) => `경험치 ${n[1]} 대신 진상 체력 ${n[0]}`,
  risk_glass: (n) => `치명타 피해 ${n[0]} 대신 회복 ${n[1]}`,
  econ_bonus: () => '지금 카드 한 장 더 고르기',
  tr_heavy: (n) => `공격력 ${n[0]} 대신 공격 속도 ${n[1]}`,
  tr_rapid: (n) => `공격 속도 ${n[0]} 대신 공격력 ${n[1]}`,
  tr_skill: (n) => `스킬 피해 ${n[0]} 대신 평타 ${n[2]}`,
  tr_wall: (n) => `입구 피해 ${n[0]} · 수리 2배 대신 공격력 ${n[1]}`,
  tr_hunt: (n) => `묶인 진상에게 피해 ${n[0]}`,
  tr_boom: (n) => `잡으면 펑! (그 진상 체력 ${n[0]})`,
  jp_party: () => '모든 멤버 레벨 +1 · 입구 20% 회복',
  jp_power: (n) => `공격력 ${n[0]} · 공격 속도 ${n[1]}`,
  jp_mom: () => '기세 가득 · 스킬 쿨 초기화 · 스킬 피해 +30%',
  fillUlt: (n) => `총공지(확성기) 게이지 ${n[0]}`,
  fillHeal: (n) => `입구 체력 ${n[0]} 회복`,
  tempSlot: () => '이번 판만 내 멤버 1명 더',
  guestCombo: () => '이번 판만 게스트 1명 더',
};
const GLOBAL_GOOD = {
  dmg: '언제나 무난해요', spd: '언제나 무난해요', gunExtra: '건전남이 주력일 때', crit: '보스전 · 한 방 멤버', hp: '입구가 위험할 때', exp: '판 초반', slow: '빠른 진상 많은 판',
  pierce: '줄지어 오는 진상', boss: '언제나 (아주 센 카드)', regen: '입구가 자꾸 맞는 판', ult: '총공지를 자주 쓸 때', charmRes: '홀리는 진상 많은 판', debuffRes: '기절·홀림 거는 진상 많은 판',
  cdCut: '스킬이 센 멤버가 있을 때', armor: '입구가 자꾸 맞는 판', attrUp: '상성이 맞는 판', swarm: '떼거리 판',
  risk_allin: '입구가 넉넉할 때만 (위험)', risk_overtime: '자신 있을 때 (진상이 세짐)', risk_glass: '치명타 빌드일 때 (회복 줄어듦)',
  econ_bonus: '언제나 (카드 한 장 더)', tr_heavy: '한 방 멤버 · 철갑 판', tr_rapid: '연타 멤버 · 떼거리 판', tr_skill: '스킬을 잘 쓸 때', tr_wall: '입구가 자꾸 맞는 판', tr_hunt: '기절 · 빙결 멤버가 있을 때', tr_boom: '떼거리 판', jp_party: '언제나 (대박)', jp_power: '언제나 (대박)', jp_mom: '스킬이 센 덱 (대박)', fillUlt: '총공지가 곧 필요할 때', fillHeal: '입구가 위험할 때', tempSlot: '언제나 (멤버 +1)', guestCombo: '언제나 (멤버 +1)',
};
// TECH (관통 II · 철갑탄 …): 길마다 쉬운 한 줄 — n = 설명 속 숫자
const TECH_HEAD = {
  pierce: (n) => `${n[0].replace('+', '')}명 더 뚫음 · 뚫는 멤버 공격력 ${n[1]}`,
  splash: (n) => `폭발 범위 ${n[0]} · 폭발 멤버 공격력 ${n[1]}`,
  chain: (n) => `${n[0].replace('+', '')}명 더 튕김 · 튕기는 멤버 공격력 ${n[1]}`,
  kb: (n) => `더 멀리 밀침 ${n[0]} · 밀치는 멤버 공격력 ${n[1]}`,
  heal: (n) => `회복량 ${n[0]} · 입구 초당 ${n[1].replace('+', '')} 자동 수리`,
  ctrl: (n) => `기절·느리게 ${n[0]} 길게 · 공격력 ${n[1]}`,
  boss: (n, big) => (big ? `보스 피해 ${n[0]} · 치명타 피해 ${n[1]}` : `보스 피해 ${n[0]} · 치명타 확률 ${n[1]}`),
};
const CC_PLAIN = { stun: '잠깐 꼼짝 못 하고 멈춤', slow: '걸음이 한동안 느려짐', freeze: '꽁꽁 얼어 잠깐 멈춤', kb: '맞으면 뒤로 밀려남', pull: '한가운데로 끌려와 모임' };
const NUM_RE = /[+\-−×]?\d+(?:\.\d+)?(?:%p|%|초|배|명|칸|번|발|겹|대|개)?/g;
const nums = (s) => (String(s || '').match(NUM_RE) || []).map((x) => x.replace('-', '−'));
const pct = (x) => Math.round(x * 100);
const fix1 = (x) => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1));
const sec = (x) => `${fix1(x)}초`;
const hdef = (id) => HEROES[id] || (SUMMONS && SUMMONS[id]) || null;
export const heroName = (id) => (hdef(id) ? hdef(id).name : '');
// 받침 있으면 a(은/이), 없으면 b(는/가) — 끝 글자가 한글이 아니면 둘 다
export function josa(word, a, b) {
  const w = String(word || '').replace(/[\s!?.~…)」\]]+$/u, '');
  const ch = w.charCodeAt(w.length - 1);
  if (!(ch >= 0xac00 && ch <= 0xd7a3)) return `${a}(${b})`;
  return (ch - 0xac00) % 28 ? a : b;
}
// 멤버 스킬 한 줄 요약 (스킬 이름 · 기본 공격 이름 포함)
export function skillPlain(id) {
  const d = hdef(id);
  if (!d) return null;
  const P = SKILL_PLAIN[id] || {};
  const atkName = (d.attack || '').split(/\s*—\s*/)[0].trim();
  const cut = (s) => { const t = String(s || '').split(/\s*[—(·]\s*/)[0].trim(); return t.length > 22 ? t.slice(0, 21) + '…' : t; };
  return {
    name: d.skill ? d.skill.name : '', sk: P.sk || (d.skill ? cut(d.skill.desc) : ''), skFull: d.skill ? d.skill.desc : '',
    atkName, atk: P.atk || cut((d.attack || '').split(/\s*—\s*/)[1] || d.attack || ''), atkFull: d.attack || d.desc || '',
    good: P.good || '', role: d.role || '',
  };
}
// 카드 설명 속 낯선 낱말 → 「낱말」은? 뜻 (없으면 그 멤버 스킬)
export function termFor(id, text) {
  const sp = skillPlain(id);
  if (!sp) return null;
  const t = String(text || '');
  const P = SKILL_PLAIN[id];
  if (sp.name && t.includes(sp.name)) return { term: sp.name, text: sp.sk };
  if (P && P.gl) for (const [w, m] of P.gl) if (t.includes(w)) return { term: w, text: m };
  if (sp.atkName && t.includes(sp.atkName)) return { term: sp.atkName, text: sp.atk };
  return sp.name ? { term: sp.name, text: sp.sk } : sp.atkName ? { term: sp.atkName, text: sp.atk } : null;
}
export const qText = (q) => (q ? `「${q.term}」${josa(q.term, '은', '는')}? ${q.text}` : '');
// 지금 판에서 그 멤버 스킬 쿨타임 (카드 · 장비 · 진화 · 증강 모두)
export function fullCd(g, h) {
  const sk = h && h.def && h.def.skill;
  if (!sk || !sk.cd) return 0;
  return sk.cd * (1 - ((h.gear && h.gear.cd) || 0)) * ((g && g.cdMul) || 1) * (h.evo ? EVO_MUL.cd : 1) * (g && g.tempo && MOMENTUM.strong && MOMENTUM.strong.includes(h.id) ? MOMENTUM.strongCd / TEMPO.cd : 1) * (h.skCdMul || 1) * (h.awake >= 2 ? 1 - TOWER_AWAKE_FX.cd : 1);
}
const heroOf = (g, id) => (g && g.heroes ? g.heroes.find((h) => h.id === id) : null);
const tagWho = (g, t) => (g && g.heroes ? g.heroes.filter((h) => (HERO_TAGS[h.id] || []).includes(t) && HEROES[h.id]).map((h) => h.def.name) : []);
const attrWho = (g, a) => (g && g.heroes ? g.heroes.filter((h) => h.def && h.def.attr === a && HEROES[h.id]).map((h) => h.def.name) : []);
// 쿨타임 카드를 보여 줄 멤버: 대장 → 스킬 쿨이 가장 긴 멤버
function cdHero(g) {
  if (!g || !g.heroes) return null;
  const hs = g.heroes.filter((h) => h.def && h.def.skill && h.def.skill.cd && HEROES[h.id]);
  return hs.find((h) => h.id === g.leader) || hs.sort((a, b) => b.def.skill.cd - a.def.skill.cd)[0] || null;
}
const firstPct = (desc) => { const m = /(\d+(?:\.\d+)?)%/.exec(desc || ''); return m ? Number(m[1]) / 100 : 0; };
const ba = (k, a, b) => ({ k, a: String(a), b: String(b) });
export const baText = (x) => (x ? `${x.k} ${x.a} → ${x.b}` : '');

// ─── 카드 한 장 → 쉬운 말 ───
export function cardPlain(c, g) {
  const out = { head: '', short: '', name: '', hero: null, q: null, ba: [], more: [], good: '', who: [], tag: null };
  if (!c) return out;
  const desc = String(c.desc || '').replace(/^★\s*/, '');
  const parts = desc.split(/\s+·\s+/).map((s) => s.trim()).filter(Boolean);
  const n = nums(desc);
  const m = (g && g.mods) || null;
  const id = c.id || '';
  const hid = c.hero && hdef(c.hero) ? c.hero : null;
  const h = hid ? heroOf(g, hid) : null;
  const nm = hid ? heroName(hid) : '';
  out.hero = hid;
  out.name = c.title || '';
  if (hid) { const sp = skillPlain(hid); if (sp) out.good = sp.good; }
  switch (c.kind) {
    case 'join': case 'addHero': {
      const sp = skillPlain(hid);
      out.head = c.kind === 'join' ? `${nm} 합류 — ${sp ? sp.atk : ''}` : `${nm} 합류 (멤버 +1)`;
      if (c.kind === 'join') out.name = sp ? sp.atkName : '';
      out.q = sp && sp.name ? { term: sp.name, text: sp.sk } : null;
      if (sp) out.more = [`기본 공격: ${sp.atk}`, sp.name ? `스킬 「${sp.name}」: ${sp.sk}` : ''].filter(Boolean);
      break;
    }
    case 'heroLv': {
      const lv = /Lv\.(\d+)→(\d+)/.exec(c.title || '');
      const perk = /^★/.test(c.desc || '');
      out.head = `${nm} ${parts[0] || '더 세짐'}`;
      out.name = perk ? '레벨업 · 새 능력' : '레벨업';
      if (lv) out.ba.push(ba('레벨', `Lv.${lv[1]}`, `Lv.${lv[2]}`));
      if (c.lvAtk) out.more.push(`${nm} 공격력 +${pct(c.lvAtk)}% (큰 카드 보너스)`);
      out.more.push(...parts.slice(1));
      out.q = termFor(hid, parts[0] || '');
      if (c.main === 'new') out.more.push('고르면 주력이 돼요 — 주력만 Lv5(진화)까지 커요');
      break;
    }
    case 'heroMod': {
      const hc = HERO_CARDS[hid];
      const what = hc ? hc.title.split(':').slice(1).join(':').trim() : parts[0];
      out.head = `${nm} ${what}`;
      out.name = '전용 카드';
      out.more = parts.filter((x) => /공격력/.test(x)).map((x) => `${nm} ${x}`);
      out.q = termFor(hid, what);
      break;
    }
    case 'skillAug': {
      const a = (SKILL_AUG[hid] || []).find((x) => x.id === c.aug);
      const raw = a ? a.desc : parts[0];
      out.head = `${nm} ${AUG_PLAIN[`${hid}:${c.aug}`] || raw}`;
      out.name = c.title || (a ? a.name : '');
      out.q = termFor(hid, `${raw} ${out.name}`);
      const extra = desc.startsWith(raw) ? desc.slice(raw.length).replace(/^\s*·\s*/, '') : '';
      out.more = [`원래 설명: ${raw}`, extra ? `${nm} ${extra}` : ''].filter(Boolean);
      if (a && a.skCd && h) { const c0 = fullCd(g, h); if (c0) out.ba.push(ba(`${h.def.skill.name} 쿨타임`, sec(c0), sec(c0 * a.skCd))); }
      break;
    }
    case 'skillEvo': {
      const sp = skillPlain(hid);
      out.head = `${nm} 스킬이 한 번 더 터짐 (75%)`;
      out.name = c.title || SKILL_EVO[hid] || '';
      out.q = sp && sp.name ? { term: sp.name, text: sp.sk } : null;
      out.ba.push(ba('스킬 한 번에', '1번', '2번'));
      out.more = [`0.5초 뒤 옆자리에 한 번 더 (75% 위력)`];
      break;
    }
    case 'evo': {
      out.head = `${nm} 공격력 ×${EVO_MUL.dmg} · 스킬 더 자주`;
      out.name = EVO[hid] ? `진화: ${EVO[hid].name}` : c.title || '';
      out.q = termFor(hid, '');
      if (h) { const c0 = fullCd(g, h); if (c0) out.ba.push(ba(`${h.def.skill.name} 쿨타임`, sec(c0), sec(c0 * EVO_MUL.cd))); }
      out.more = [`공격력 ×${EVO_MUL.dmg}`, `공격 속도 +${pct(EVO_MUL.spd)}%`, `스킬 쿨타임 −${pct(1 - EVO_MUL.cd)}%`, '한 판에 한 번'];
      out.good = '언제나 (아주 센 카드)';
      break;
    }
    case 'cc': {
      const K = CC_KINDS[c.cc] || { name: '' };
      const ccN = h ? h.ccN || 0 : 0;
      const p1 = n[0] || `${pct(CC_ON_HIT.chance[Math.min(2, ccN)])}%`;
      out.head = `${nm} 공격에 ${p1} 확률 ${K.name}`;
      out.name = c.title ? c.title.split(': ').pop() : K.name;
      out.ba.push(ba(`${K.name} 확률`, ccN ? `${pct(CC_ON_HIT.chance[ccN - 1])}%` : '0%', p1.replace('+', '')));
      out.q = CC_PLAIN[c.cc] ? { term: K.name, text: CC_PLAIN[c.cc] } : termFor(hid, '');
      out.good = c.cc === 'slow' || c.cc === 'freeze' ? '빠른 진상 많은 판' : c.cc === 'kb' || c.cc === 'pull' ? '입구 앞까지 몰려올 때' : '센 진상 · 보스 앞 시간 벌기';
      break;
    }
    default: {
      // 공용 · 테크 · 무한 · 채우기 · 숨은 카드
      const tm = /^tech_(\w+)_(\d)$/.exec(id);
      if (tm) {
        const t = tm[1], big = tm[2] === '3';
        out.head = TECH_HEAD[t] ? TECH_HEAD[t](n.concat(['', '']), big) : desc;
        out.tag = t;
        out.good = TAG_GOOD[t] || '';
      } else if (GLOBAL_HEAD[id]) {
        out.head = GLOBAL_HEAD[id](n.concat(['', '']));
        out.good = GLOBAL_GOOD[id] || '';
      } else if (/^syn_/.test(id) || c.attr) {
        const a = c.attr || id.slice(4);
        out.head = `${ATTRS[a] ? ATTRS[a].name : ''} 멤버 공격력 ${n[0] || ''}`;
        out.who = attrWho(g, a);
        out.good = '같은 속성 멤버가 많을 때';
      } else {
        out.head = parts[0] || desc;
        out.more = parts.slice(1);
      }
      if (!out.tag && c.tag && TAGS[c.tag]) out.tag = c.tag;
      if (!out.good && out.tag) out.good = TAG_GOOD[out.tag] || '';
      if (out.tag && !out.who.length) out.who = tagWho(g, out.tag);
      if (!out.more.length) out.more = parts.length > 1 ? parts : [];
      if (m) out.ba = globalBA(c, g, id, n);
      break;
    }
  }
  if (!out.head) out.head = desc || c.title || '';
  if (out.name === out.head) out.name = '';
  // 카드 위 짧은 한 줄: 멤버 얼굴이 이미 보이니 맨 앞 이름은 뺀다 (시트 · 기록엔 이름까지)
  out.short = nm && out.head.startsWith(nm + ' ') ? out.head.slice(nm.length + 1) : out.head;
  return out;
}
// 공용 카드: 지금까지 → 고르면
function globalBA(c, g, id, n) {
  const m = g.mods, p = firstPct(c.desc);
  const r = [];
  const tm = /^tech_(\w+)_(\d)$/.exec(id);
  const t = tm ? tm[1] : c.tag;
  const tagAdd = (x) => { if (t && TAGS[t]) r.push(ba(`${TAG_PLAIN[t] || TAGS[t].name} 멤버 공격력`, `+${pct(m.tagDmg[t] || 0)}%`, `+${pct((m.tagDmg[t] || 0) + x)}%`)); };
  if (tm) {
    const big = tm[2] === '3';
    if (t === 'pierce') r.push(ba('뚫고 지나가는 수', `${m.pierce}명`, `${m.pierce + (big ? 2 : 1)}명`));
    else if (t === 'splash') r.push(ba('폭발 범위', `${pct(m.splashMul)}%`, `${pct(m.splashMul * (big ? 1.35 : 1.25))}%`));
    else if (t === 'chain') r.push(ba('튕기는 수', `+${m.chainExtra}`, `+${m.chainExtra + (big ? 2 : 1)}`));
    else if (t === 'kb') r.push(ba('밀치는 힘', `${pct(m.kbMul)}%`, `${pct(m.kbMul * (big ? 1.7 : 1.4))}%`));
    else if (t === 'heal') r.push(ba('회복량', `${pct(m.healMul)}%`, `${pct(m.healMul * (big ? 1.8 : 1.5))}%`));
    else if (t === 'ctrl') r.push(ba('기절·느리게 시간', `${pct(m.ctrlMul)}%`, `${pct(m.ctrlMul * (big ? 1.6 : 1.35))}%`));
    else if (t === 'boss') r.push(ba('보스 피해', `+${pct(m.bossDmg)}%`, `+${pct(m.bossDmg + (big ? 0.7 : 0.35))}%`));
    if (t !== 'heal' && t !== 'boss') tagAdd(big ? 0.7 : 0.35);
    return r;
  }
  switch (id) {
    case 'dmg': case 'boss': r.push(ba('모든 멤버 공격력', `+${pct(m.dmg - 1)}%`, `+${pct(m.dmg - 1 + p)}%`)); break;
    case 'spd': r.push(ba('공격 속도', `+${pct(m.spd - 1)}%`, `+${pct(m.spd - 1 + p)}%`)); break;
    case 'crit': r.push(ba('치명타 확률', `${pct(m.crit)}%`, `${pct(m.crit + p)}%`)); break;
    case 'hp': if (g.base) r.push(ba('입구 최대 체력', Math.round(g.base.max), Math.round(g.base.max * (1 + p)))); break;
    case 'pierce': r.push(ba('뚫고 지나가는 수', `${m.pierce}명`, `${m.pierce + 1}명`)); break;
    case 'tag_pierce': r.push(ba('뚫고 지나가는 수', `${m.pierce}명`, `${m.pierce + 1}명`)); tagAdd(p); break;
    case 'tag_splash': r.push(ba('폭발 범위', `${pct(m.splashMul)}%`, `${pct(m.splashMul * (1 + p))}%`)); break;
    case 'tag_chain': r.push(ba('튕기는 수', `+${m.chainExtra}`, `+${m.chainExtra + 1}`)); break;
    case 'tag_kb': r.push(ba('밀치는 힘', `${pct(m.kbMul)}%`, `${pct(m.kbMul * (1 + p))}%`)); break;
    case 'tag_heal': r.push(ba('회복량', `${pct(m.healMul)}%`, `${pct(m.healMul * (1 + p))}%`)); break;
    case 'tag_ctrl': r.push(ba('기절·느리게 시간', `${pct(m.ctrlMul)}%`, `${pct(m.ctrlMul * (1 + p))}%`)); break;
    case 'tag_boss': r.push(ba('보스 피해', `+${pct(m.bossDmg)}%`, `+${pct(m.bossDmg + p)}%`)); break;
    case 'swarm': r.push(ba('보통 진상 피해', `+${pct(m.swarmDmg)}%`, `+${pct(m.swarmDmg + p)}%`)); break;
    case 'ult': { const p2 = firstPct(String(c.desc).split(' · ')[1]); r.push(ba('총공지 피해', `+${pct(m.ultDmg - 1)}%`, `+${pct(m.ultDmg - 1 + p2)}%`)); break; }
    case 'gunExtra': {
      const gh = heroOf(g, 'gunman'), d = HEROES.gunman;
      const n0 = (d && d.pistol && gh ? d.pistol.n[Math.max(0, Math.min(4, gh.lv - 1))] : 1) + (m.gunExtra || 0);
      r.push(ba('건전남 한 번에', `${n0}발`, `${n0 + 1}발`));
      break;
    }
    case 'cdCut': {
      const h = cdHero(g);
      if (h) {
        const c0 = g.cdCard || 1, c1 = Math.max(1 - GROW.cdMax, c0 * Math.max(0.05, 1 - p)), k = c1 / c0, cd = fullCd(g, h);
        if (cd) r.push(ba(`${h.def.name} 「${h.def.skill.name}」`, sec(cd), sec(cd * k)));
      }
      break;
    }
    case 'risk_allin': if (g.base) r.push(ba('입구 최대 체력', Math.round(g.base.max), Math.round(g.base.max * (1 - p)))); break;
    case 'econ_bonus': r.push(ba('남은 카드', `${g.pendingLevels || 1}장`, `${(g.pendingLevels || 1) + 1}장`)); break;
  }
  if (/^syn_/.test(id) && c.attr !== undefined) { const a = c.attr || id.slice(4); r.push(ba(`${ATTRS[a] ? ATTRS[a].name : ''} 멤버 공격력`, `+${pct(m.attrDmg[a] || 0)}%`, `+${pct((m.attrDmg[a] || 0) + p)}%`)); }
  if (/^tag_(splash|chain|kb|heal|ctrl)$/.test(id)) tagAdd(firstPct(String(c.desc).split(' · ')[1] || c.desc));
  void n;
  return r;
}
// 고른 카드 기록 한 줄 (일시정지 화면 · 멤버 정보): "쉬운 한 줄 (원래 이름)"
export function pickedLine(c, g) {
  const p = cardPlain(c, g);
  return { head: p.head, name: p.name, hero: p.hero };
}
// 이 판에서 그 멤버에게 고른 스킬 증강 · 스킬 진화 · 진화 (멤버 정보 카드)
export function heroBuildLines(h) {
  if (!h) return [];
  const out = [];
  for (const a of SKILL_AUG[h.id] || []) if (h.sa && h.sa[a.id]) out.push({ name: a.name, head: AUG_PLAIN[`${h.id}:${a.id}`] || a.desc });
  if (h.skEvo && SKILL_EVO[h.id]) out.push({ name: SKILL_EVO[h.id], head: '스킬이 한 번 더 터짐 (75%)' });
  if (h.evo && EVO[h.id]) out.push({ name: `진화: ${EVO[h.id].name}`, head: `공격력 ×${EVO_MUL.dmg} · 스킬 더 자주` });
  return out;
}
