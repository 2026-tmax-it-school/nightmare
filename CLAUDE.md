# 프로젝트: 공포 추리 2D 웹 게임 (공모전 출품)

- 작업 전 반드시 `docs/GDD.md`를 읽는다. 기획의 단일 기준이다.
- 기획 결정이 바뀌면 코드보다 GDD를 먼저 갱신한다. 미해결 항목은 GDD 9장에 둔다.
- 사용자와 한국어로 소통한다.
- 1인 개발 공모전 작품이므로 범위를 작게 유지한다 (플레이 약 20분).

## 실행
- `python tools/serve.py` → http://localhost:8123 (빌드 도구 없음, Phaser 3.80.1 CDN + ES 모듈)
- `?debug`: 화면이 가려져도 게임 루프가 돌고 `window.__game` 노출 (브라우저 패널 자동 테스트용)
- `?dev`: 개발자 모드 — 타이틀 대신 체크포인트 선택 화면. `?dev&start=<id>`로 바로 그 시점부터 시작, 플레이 중 `` ` `` 키로 선택 화면 복귀. 저장은 별도 슬롯(`ithope_save_v1_dev`). 체크포인트는 `data/checkpoints.json`(`from`으로 앞 체크포인트 상태 상속) — 콘텐츠가 바뀌면 플래그·좌표도 함께 갱신. 상세: `docs/개발자_모드.md`

## 구조
- `src/scenes/` — Boot(데이터·텍스처 로드), Title, Cutscene, Explore(탑뷰 탐색·추격), GameOver, DemoEnd
- `src/script.js` — JSON 스크립트 실행기 (`t`: text, if, choice, clue, item, fragment, puzzle, deduction, memory, chase, openDoor, stage, goto …)
- `src/ui/ui.js` — 대화창, 선택지, 퍼즐(seat/keypad), 기억 재구성, 기억 노트
- `src/state.js` — 플래그·단서·소지품·조각·부정 수치, localStorage 저장
- `src/audio.js`, `src/textures.js` — 임시 합성 사운드 / 임시 도트 그래픽 (에셋 확정 후 교체)
- `data/` — 콘텐츠 전부: `maps/*.json`(문자 그리드 + 오브젝트 + 스크립트), `cutscenes.json`, `clues.json`, `puzzles.json`(퍼즐·추리), `hints.json`
- 콘텐츠 추가는 대부분 `data/`만 수정한다. 새 맵은 `src/constants.js`의 `MAPS`에 등록.
