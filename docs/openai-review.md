# nightmare OpenAI PR 코드리뷰

## 현재 상태

설정 작업 시작 시 nightmare는 빈 저장소였으나, 작업 중 Phaser 3 웹 데모가 `main`에 추가되었습니다 (`95b5f33edd14def27478b344441620f2527fb7cb`). 기존 게임 코드·README·기획 문서는 변경하지 않고 리뷰 연결만 별도 PR로 제안합니다. 이 데모에는 빌드 과정이나 자동화된 앱 테스트 스크립트/CI가 아직 없습니다. `develop` 브랜치는 아직 만들지 않았습니다. 병합 후 필요할 때 최신 `main`에서 `develop`을 만들면 두 브랜치에 같은 워크플로가 포함됩니다.

`Review integration checks`는 이 연결 설정의 회귀 테스트만 실행합니다. 애플리케이션의 테스트·타입 검사·빌드 성공을 의미하지 않습니다. 앱 CI가 준비되면 아래 절차대로 실제 앱 CI에 연결해야 합니다.

## 활성화 전 필요한 작업

1. 관리자가 PR을 검토하고 기본 브랜치 `main`에 병합합니다. `workflow_run` 수신 파일은 기본 브랜치에 있어야 합니다.
2. 사용자가 기존 TMAXyoungkk와 같은 OpenAI **Default** 프로젝트의 키를 GitHub Actions repository secret **KEY**에 직접 등록합니다. `KEY`를 재사용 워크플로의 `OPENAI_API_KEY` 입력으로 전달합니다. 키 값을 채팅이나 코드에 넣지 마세요. GitHub에 저장된 다른 저장소의 키 값은 읽거나 복사할 수 없습니다. 새 키 생성이나 권한 변경은 이 PR에 포함하지 않습니다.
3. 모든 참여 저장소가 같은 프로젝트를 사용하여 기존 **월 USD 4** 한도를 공유하는지 확인합니다. 예산 알림만으로는 지출이 차단되지 않으며, 실제 강제 한도와 자동 충전 상태를 확인해야 합니다. 세금·환율·동시 요청·한도 반영 지연으로 원화 결제액을 보장할 수 없습니다. 별도 프로젝트/키를 임의로 만들어 예산을 분리하지 않습니다.
4. 선택한 PR diff가 OpenAI로 전송된다는 점과 위 비용 조건을 확인한 뒤 Actions variable `OPENAI_REVIEW_BUDGET_CONFIRMED=true`, 마지막으로 `OPENAI_REVIEW_ENABLED=true`를 설정합니다. 중지하려면 `OPENAI_REVIEW_ENABLED`를 지우거나 `false`로 바꿉니다.

2026-10-10 설정 확인 시 nightmare에는 repository/environment secret, 사용 가능한 organization secret, review 활성화 variable이 없었습니다. 이 PR은 키·변수·Actions 보안 설정을 변경하지 않습니다. 키와 두 변수가 없으면 유료 요청을 보내지 않습니다.

## 동작 및 안전 경계

- `main`, `develop`을 대상으로 하는 같은 저장소 및 외부 fork PR을 지원합니다. 열린 일반 PR의 최신 head에 대한 `Review integration checks`가 성공한 뒤 리뷰합니다. Draft, bot, 닫힌 PR, 실패한 검사, 오래된 head, 중복 요청은 건너뜁니다. draft를 ready로 변경하면 검증이 다시 실행됩니다.
- GitHub 자체의 외부 기여자 Actions 실행 승인 정책은 그대로 적용됩니다. 그 승인이 필요한 경우 CI부터 시작되어야 합니다. 이 변경은 승인 정책이나 브랜치 보호를 바꾸지 않습니다.
- 권한을 가진 리뷰 작업은 TMAXyoungkk의 고정된 중앙 코드만 실행합니다. nightmare의 PR 코드·의존성·artifact·cache를 실행하지 않습니다. 외부 fork의 diff는 고정 base/head SHA 비교 API에서 데이터로만 읽습니다.
- 외부 fork PR을 저장소 ID·브랜치·전체 SHA·base 정보로 유일하게 연결하며, 상태를 API 호출 전후 다시 확인합니다. 제목·본문은 모델에 보내지 않습니다.
- 중앙 reusable workflow: `2026-tmax-it-school/TMAXyoungkk/.github/workflows/openai-review-reusable.yml@c67bf2fd543117fddcc8d3041916dae73db4850b`
- 해당 workflow의 리뷰 코드 pin: `dfd7d49ab5c4bb666679289914eb713c28c11868`. 불변 SHA이므로 중앙 저장소 업데이트가 자동 반영되지 않습니다. 업데이트할 때 코드/워크플로를 검토하고 pin을 함께 변경합니다.
- 한 PR/head SHA당 최대 1회 API 요청, 최대 20개 파일/32,000바이트 diff, 출력 최대 2,000토큰, high/medium 발견사항 최대 5개입니다. `gpt-6-luna`, Responses API, `store:false`, 모델 도구 없음 조건을 그대로 사용합니다.
- 같은 저장소는 최대 3,000개, fork는 불변 비교 API의 최대 300개 파일 목록에서 부분 검토합니다. 제외·미조회 수가 결과에 표시됩니다. 숨김/비밀 관련 경로, lockfile, 생성물 등은 제외하지만 모든 비밀을 탐지하는 시스템은 아닙니다.
- API 실패/타임아웃도 같은 SHA에서는 자동 재시도하지 않습니다. 새 PR/head가 많으면 비용도 늘므로 요청별 상한만으로 월 예산이 보장되지 않습니다.
- 결과는 COMMENT 리뷰입니다. 승인·변경 요청·자동 수정·자동 병합은 하지 않습니다. 사람의 리뷰와 실제 앱 CI가 필요합니다.

## 앱 CI가 생기면

실제 앱 CI의 검사 내용을 먼저 정하고 PR마다 실행하도록 구성합니다. `pull_request` 대상은 `[main, develop]`, types는 `[opened, synchronize, reopened, ready_for_review]`를 포함해야 합니다.

`.github/workflows/openai-review.yml`의 세 설정을 실제 앱 CI에 맞춰 함께 바꿉니다.

- `workflow_run.workflows`: 실제 앱 CI의 정확한 workflow `name`
- `with.ci-name`: 위와 같은 정확한 `name`
- `with.ci-path`: 그 workflow 파일의 저장소 내 경로

현재 값은 `Review integration checks`, `Review integration checks`, `.github/workflows/review-integration-checks.yml`입니다. 테스트 파일의 기대값도 함께 갱신하고, 실제 앱 CI가 실패할 때 리뷰가 실행되지 않는지 확인합니다. 다른 프로젝트의 앱 구조나 설치 명령은 복사하지 않습니다.

## 검증

`node --test .github/scripts/review-integration.test.mjs`

Node 24만 필요하며 외부 패키지, 네트워크, 실제 API 키 없이 설정 회귀 테스트를 실행합니다. 워크플로 pin/권한, 검증 이름·경로 연결, main/develop 이벤트, 두 활성화 gate를 확인합니다. 실제 OpenAI 유료 호출은 이 변경의 검증에 포함하지 않습니다.

중앙 코드와 상세 설계: [TMAXyoungkk OpenAI 리뷰 문서](https://github.com/2026-tmax-it-school/TMAXyoungkk/blob/c67bf2fd543117fddcc8d3041916dae73db4850b/docs/openai-review.md).
