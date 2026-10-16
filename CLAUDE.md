# 프로젝트: 공포 추리 2D 웹 게임 (공모전 출품)

- 작업 전 반드시 `docs/GDD.md`를 읽는다. 기획의 단일 기준이다.
- 기획 결정이 바뀌면 코드보다 GDD를 먼저 갱신한다. 미해결 항목은 GDD 9장에 둔다.
- 사용자와 한국어로 소통한다.
- 학생 팀 작업은 `docs/team-workflow.md`와 `.agents/skills/team-common.md`를 따른다. .agents/skills/의 team-start(시작)·team-submit(제출)를 사용한다. team 스킬 본문은 `.agents/skills/`에 있다.
- 팀 작업의 사용자 안내는 `docs/team-protocol.md`를 읽고 현재 단계·실제 결과·다음 행동을 설명한다. 설명 요청만으로 배정·제출·종료를 시작하지 않는다.
- 팀 작업 설명은 학생(개발·QA)의 작업 방식과 관리자의 작업 방식을 나누고, 각 역할의 시점·행동·사용 스킬을 안내한다.
- 1인 개발 공모전 작품이므로 범위를 작게 유지한다 (플레이 약 20분).

## 실행
- `python tools/serve.py` → http://localhost:8123 (빌드 도구 없음, Phaser 3.80.1 CDN + ES 모듈)
- `?debug`: 화면이 가려져도 게임 루프가 돌고 `window.__game` 노출 (브라우저 패널 자동 테스트용)
- `?dev`: 개발자 모드 — 타이틀 대신 체크포인트 선택 화면. `?dev&start=<id>`로 바로 그 시점부터 시작, 플레이 중 `` ` `` 키로 선택 화면 복귀. 저장은 별도 슬롯(`ithope_save_v1_dev`). 체크포인트는 `data/checkpoints.json`(`from`으로 앞 체크포인트 상태 상속) — 콘텐츠가 바뀌면 플래그·좌표도 함께 갱신. 상세: `docs/개발자_모드.md`

## 구조
- `src/scenes/` — Boot(데이터·텍스처 로드), Title, Cutscene, Explore(탑뷰 탐색·추격), GameOver, Ending(엔딩 화면·2회차 기록)
- `src/script.js` — JSON 스크립트 실행기 (`t`: text, if, choice, clue, item, fragment, puzzle, deduction, memory, chase, openDoor, stage, goto …)
- `src/ui/ui.js` — 대화창, 선택지, 퍼즐(seat/keypad), 기억 재구성, 기억 노트
- `src/state.js` — 플래그·단서·소지품·조각·부정 수치, localStorage 저장
- `src/audio.js`, `src/textures.js` — 임시 합성 사운드 / 임시 도트 그래픽 (완성 그림이 없는 것만 사용)
- `assets/sprites/` — 완성 그래픽(AI 생성). `tools/sprites.py`가 `assets/source/`(원본, Git 미포함)에서 만든다. 제작 방법: `docs/에셋_제작_가이드.md`
- `data/` — 콘텐츠 전부: `maps/*.json`(문자 그리드 + 오브젝트 + 스크립트), `cutscenes.json`, `clues.json`, `puzzles.json`(퍼즐·추리), `hints.json`
- 콘텐츠 추가는 대부분 `data/`만 수정한다. 새 맵은 `src/constants.js`의 `MAPS`에 등록.
