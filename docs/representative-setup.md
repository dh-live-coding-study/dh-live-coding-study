# 대표자 설정

대표자가 별도 서버를 운영하지 않습니다. GitHub Actions의 `interview-llm` Environment에 키를 보관하고, 기본 브랜치의 면접 코드만 키를 사용합니다. 참여자는 개인 GitHub 토큰으로 정답 등록 워크플로를 요청합니다.

## 권한과 키

1. 조직 owner와 저장소 admin은 키를 관리할 대표자 한 명만 유지합니다. 참여자는 조직 일반 멤버와 저장소 Write 권한으로 등록합니다.
2. main 보호에 PR, 최신 기준의 `test` 검사와 관리자 적용을 켭니다. main 갱신 허용 대상은 대표자만 지정하고 강제 push와 삭제는 막습니다. 필수 승인 수를 0으로 두더라도 저장소 지침의 독립 검토는 별도로 수행합니다.
3. Settings → Environments에서 `interview-llm`을 만들고, Deployment branches and tags를 `Selected branches and tags`로 설정합니다. **Branch `main`만 허용**하고 Tag 규칙은 만들지 않습니다.
4. 이 Environment의 Secret에 `LLM_API_KEY`를 넣습니다. 저장소나 조직의 일반 Secret에는 같은 키를 중복 등록하지 않습니다.
5. 같은 Environment의 Variable에 `LLM_MODEL`을 지정합니다. 다른 제공자를 사용하면 `LLM_BASE_URL`도 지정합니다. URL은 `/chat/completions` 앞부분이며 설정 파일의 값을 덮어씁니다.

복제하거나 새 저장소에서 사용하면 위 설정을 다시 확인해야 합니다. 관리자를 추가하면 그 관리자도 키 교체와 이를 사용하는 워크플로 변경 권한을 갖습니다.

정답 등록 워크플로는 면접 워크플로를 호출할 때 `LLM_API_KEY`를 이름으로 전달합니다. 실제 키는 면접 작업이 지정한 `interview-llm` Environment에서 가져오며, 저장소 Secret에 중복 등록하지 않습니다. PR 댓글을 쓰는 작업과 호출부는 `pull-requests: write`를 사용하며, 호출자 확인 작업은 읽기 권한만 사용합니다.

워크플로는 키가 없는 사전 확인 단계에서 자동 수집 PR인지, 등록된 참여자나 수동 실행한 관리자인지 확인합니다. 통과한 실행만 면접 대기열과 Environment에 진입합니다. 코드와 스킬은 main에서 읽고, 제출 소스는 자료로 읽기만 합니다. 참여자 브랜치의 프로그램을 실행하지 않습니다. main에 들어오는 워크플로 변경을 대표자가 검토하는 것이 키 보호의 전제입니다.

## 제공자와 사용량

현재 어댑터는 Chat Completions 호환 API를 사용합니다. `model`, `messages`, `stream: false`, `store: false`, `max_completion_tokens`와 텍스트 `choices` 응답을 지원하는 제공자와 모델을 선택합니다. 주소와 모델 변경만으로 모든 제공자가 호환되지는 않습니다. 다른 프로토콜은 `lib/llm.mjs`에 어댑터를 추가해야 합니다.

요청 기본 한도는 PR당 12회, 출력 1,600토큰, 입력 48,000자입니다. 문자는 토큰과 다릅니다. 실패와 `/retry`도 요청 횟수에 포함되며 새 PR을 만들면 한도가 새로 적용됩니다. 조직 전체 비용 상한은 구현하지 않았으므로 제공자 대시보드에서 예산과 사용량을 관리합니다. `store: false`만으로 제공자의 모든 보관 정책이 정해지는 것은 아닙니다.

## 첫 실행 확인

1. 분리된 PR을 선행 순서대로 main에 반영하고 참여자 설정을 등록합니다. 다음 PR은 앞선 PR 병합 후 base를 main으로 바꾸고 검증과 독립 검토를 확인합니다.
2. 본인의 새 Java 정답을 제출해 수집 PR의 `Solution.java`가 제출 원문과 같은지 확인합니다.
3. `Import Java submission`에서 등록과 면접 작업을 확인합니다. 첫 질문에 영어 댓글로 답하고 `/finish`로 종료해 봅니다.
4. 오류가 나면 Actions와 상태 댓글을 확인합니다. HTTP 401은 키 설정을, 429는 제공자 한도와 사용량을 확인합니다. 수정 후 참여자가 `/retry`를 남기거나 대표자가 면접 워크플로를 수동 실행합니다. 실패한 요청은 수동 실행만으로 재호출하지 않으며 `/retry` 댓글이 필요합니다.
