# 랑방대전 작업방

**랑방대전 게임을 고치는 곳입니다. 여기서 작업하세요.**

- 브랜치: `feat-bal2` (main 이 아님 — 여기서 고쳐야 본체가 안 깨집니다)
- 저장소: https://github.com/hochan3873/chandem (private)
- 인터넷 주소: https://chandem.onrender.com/langbang/

## 뭘 고치면 되나

| 고치고 싶은 것 | 파일 |
|---|---|
| **캐릭터 능력치 · 밸런스** | `public/langbang/data.js` ← 제일 많이 건드리는 곳 |
| 게임 진행 로직 | `public/langbang/game.js` |
| 전투 계산 | `public/langbang/sim.js` |
| 화면 그리기 | `public/langbang/render.js` |
| 효과·연출 | `public/langbang/skillfx.js`, `audio.js` |
| 친구전 · PVP | `public/langbang/friends.js`, `pvp.js` |
| 레이드 | `public/langbang/raid2.js`, `raid2-ui.js`, `raid2-sim.js` |
| 봉개 모드 | `public/langbang/bonkae.js`, `bonkae-ui.js` |
| 서버 쪽 규칙 | `server/langbang-rules.js` 외 `server/langbang-*.js` |
| 캐릭터 그림 | `public/img/lb/` |

밸런스 수치를 바꾼 뒤 확인: `node scripts/lb-balance.js stagecalib`

## data.js 안에서 자주 고치는 것

- `HEROES` — 캐릭터별 공격력(`dmg`)·공격속도(`interval`)·사거리(`range`)·스킬
- `TEMPO.fix` — 캐릭터별 템포 보정값 (숫자가 크면 세짐)
- `STAGE.stageAdd` — 스테이지별 난이도 가감
- `ATTACK_RELEASE` — 공격 모션에서 투사체가 나가는 프레임

## 실행

```bash
npm install     # 처음 한 번만
npm start       # 서버 켜기
```

열리는 주소: http://localhost:3000/langbang/

## 주의

- **`찬덤` 폴더(main)는 직접 고치지 마세요.** 여기서 고치고 나중에 합칩니다.
- `_자료/` 는 기획 메모·대화기록 보관용입니다 (git 에 안 올라감).
- 이 폴더는 `찬덤` 저장소의 작업용 복사본(git worktree)입니다. 폴더를 옮기면
  연결이 끊기니, 옮겼다면 `찬덤` 에서 `git worktree repair` 를 실행하세요.

## 같은 저장소의 다른 폴더

| 폴더 | 브랜치 | 용도 |
|---|---|---|
| `..\찬덤` | `main` | 본체. 오목·섯다·홀덤·랑방대전 전부 |
| `..\랑방대전` | `feat-bal2` | **여기 — 랑방대전 수정** |
| `..\랑방대전-장비` | `feat-kits` | 장비 작업용 (지금 비어 있음) |
