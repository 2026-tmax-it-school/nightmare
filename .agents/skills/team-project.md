# 세 칸 프로젝트의 gh 사용 지침

스킬의 프로젝트 작업 전에 `.agents/team-project.json`을 읽는다. 공개 설정만 포함하며 토큰은 저장하지 않는다. 실제 Project/Status/옵션 ID와 이름을 조회해 설정과 일치하는지 확인한다. 프로젝트를 임의로 다시 만들거나 새로운 상태를 추가하지 않는다.

## 조회

- `gh project view 2 --owner 2026-tmax-it-school --format json`
- `gh project field-list 2 --owner 2026-tmax-it-school --format json`
- `gh project item-list 2 --owner 2026-tmax-it-school --format json --limit 1000`

item-list의 totalCount와 조회 개수를 비교한다. 누락되면 GraphQL의 items cursor로 끝까지 조회하거나 조회 제한을 표시하고 선점/변경은 전체 확인 전 보류한다. Draft 카드·다른 저장소·PR 카드를 개발 이슈 목록에서 제외한다. 이슈 URL로 카드를 식별하고 issue 상태·assignees는 GitHub 이슈에서 재조회한다.

권한이 없으면 `gh auth refresh -s project`로 사용자 인증을 안내한다. repo 쓰기 권한과 Project 쓰기 권한은 별개이므로 둘 다 확인한다. 계정별로 한 번 필요하며 scope가 있어도 보드 접근이 안 되면 선생님에게 보드 접근 권한을 요청한다. 스킬이 공유 범위를 자동 변경하지 않는다.

## 상태 변경

선점·제출·포기 요청의 대상 이슈에만 쓴다. QA 학생은 직접 플레이 확인하며, 실패하면 기존 이슈를 다시 연다. 전체 작업을 해결한 이슈는 main 병합 시 자동 종료한다. 목록 조회는 카드 추가/수정도 하지 않는다.

1. URL로 카드를 찾는다. 없으면 쓰기 요청 범위에서 `gh project item-add 2 --owner 2026-tmax-it-school --url <이슈 URL> --format json`으로 추가하고 ID를 조회한다. 동일 URL의 카드가 있으면 추가하지 않는다. 신규 이슈는 프로젝트의 기존 Auto-add to project가 추가한다. 자동화 지연/권한 실패는 실제 상태로 보고한다.
2. 설정의 project ID·field ID·선택한 상태 option ID와 확인한 item ID로 변경한다:

   `gh project item-edit --project-id <project ID> --field-id <Status field ID> --id <item ID> --single-select-option-id <option ID>`

3. 카드를 재조회해 Status가 실제 바뀌었는지 확인한다. 새로 추가된 카드의 자동화가 상태를 덮어쓰면 재조회 후 해당 요청의 기대 상태로 한 번 복구한다. 또 불일치하면 중단하고 설명한다. 전체 카드 상태를 무조건 재설정하지 않는다.

## 단계별 의미

| 동작 | Status | 담당자·이슈 |
|---|---|---|
| 새 미할당 이슈 | 할 일 | 열린 상태, 개발자가 선택 |
| 선점 | 작업 중 | 본인 단독 assign 확인 후 이동 |
| PR 제출/병합 대기 | 작업 중 | PR 링크로 상세 상황 확인 |
| QA 실패 | 작업 중 | 기존 이슈 재개, 담당자 유지 |
| 포기·인계 | 할 일 | 자기 assign 해제, 인계 내용 유지 |
| 전체 작업 해결 PR의 main 병합 | 완료 | `Closes #번호`로 이슈 자동 종료 → Item closed 자동화 |

완료 카드의 열린 이슈, 할 일 카드의 담당자 존재, 작업 중 카드의 담당자 없음처럼 어긋나면 상황을 먼저 보고한다. 목록 조회로 수정하지 않는다. 선점 전에는 이슈 상태·카드·담당자를 재확인한다. 병합으로 닫힌 이슈의 카드 반영이 실패하면 관리자에게 복구를 요청한다. 새 선점으로 과거 QA 대기 카드나 담당자를 바꾸지 않는다.

## 보드 자동화

nightmare의 열린 이슈 자동 추가와 신규 카드의 할 일 배치를 사용한다. PR 연결은 작업 중이다. 전체 작업을 해결하는 PR에 `Closes #번호`를 넣으면 기본 브랜치 main 병합 시 이슈가 자동 종료되고 Item closed가 완료로 반영한다. Approve만 누르거나 중간 PR만 병합하면 완료 처리하지 않는다. 카드 이동만으로 이슈를 자동 종료하지 않는다. 이슈를 다시 열었을 때 카드 상태가 어긋나면 관리자가 작업 중으로 복구한다. 스킬은 자동화 설정을 임의로 변경하지 않는다.
