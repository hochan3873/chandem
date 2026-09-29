'use strict';
// 마스터(운영자) 계정 목록.
// 1) 아래 MASTER_DEFAULT 에 아이디(로그인할 때 쓰는 영어 아이디, 닉네임 아님)를 적거나
// 2) 서버 환경 변수 MASTER_USERS=아이디1,아이디2 로 정할 수 있다 (둘 다 쓰면 합쳐짐).
// 화면이 보내는 값은 절대 믿지 않는다 — 마스터 여부는 항상 서버가 계정 아이디로 판단한다.

const MASTER_DEFAULT = [
  'gun8401', // 찬
];

function masterList(env = process.env.MASTER_USERS) {
  const fromEnv = String(env || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return new Set([...MASTER_DEFAULT.map((s) => String(s).trim().toLowerCase()), ...fromEnv]);
}

// 환경 변수는 테스트에서 바꿀 수 있게 매번 읽는다 (가벼운 연산)
function isMasterName(username) {
  if (!username) return false;
  return masterList().has(String(username).toLowerCase());
}

module.exports = { MASTER_DEFAULT, masterList, isMasterName };
