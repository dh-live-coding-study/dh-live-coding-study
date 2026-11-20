# DH live coding study

정답 판정을 받은 Java 제출 원문을 GitHub PR에 기록합니다. [Java 영어 면접 코칭 스킬](skills/java-live-coding-coach/SKILL.md)은 공개용 지침이며, 댓글 면접 연결은 별도 PR에서 추가합니다.

## 시작하기

이 PR과 선행 기본 설정 PR이 main에 병합돼야 워크플로를 실행할 수 있습니다. `study.config.json`에 참여자를 등록합니다.

```json
"members": [
  { "id": "learner", "leetcode": "YOUR_LEETCODE_USERNAME", "github": "YOUR_GITHUB_LOGIN" }
]
```

`id`는 폴더 이름입니다. 수집 당시의 LeetCode 계정과 워크플로를 실행한 GitHub 계정을 등록된 값과 대조합니다. 설정 변경도 `leetcode/` 브랜치의 PR로 제출하고 검토 후 병합합니다.

대표자는 조직과 저장소의 `Allow GitHub Actions to create and approve pull requests`를 허용합니다. 이 설정에서 생성과 승인이 묶여 있지만 구현은 PR 생성만 합니다. main에는 PR과 CI를 요구하고 갱신 허용 대상을 대표자로 제한합니다. 조직 owner와 저장소 admin도 대표자만 유지하고, 참여자는 조직의 일반 멤버와 저장소 Write 권한으로 등록합니다.

1. 본인의 fine-grained GitHub 토큰을 만듭니다. Resource owner는 스터디 조직, Repository access는 이 저장소 하나만 지정합니다.
2. 권한은 `Actions: Read and write`, `Pull requests: Read-only`, `Contents: Read-only`로 지정합니다. 읽기 권한은 PR에 실제 원문이 저장됐는지 확인하는 데 사용합니다.
3. Chrome의 `chrome://extensions`에서 개발자 모드를 켜고 `압축해제된 확장 프로그램을 로드합니다`로 `extension/` 폴더를 선택합니다.
4. 확장 아이콘을 열어 저장소, 등록된 멤버 ID, LeetCode 아이디와 토큰을 입력합니다. 공개 전송 동의를 켜고 저장합니다.
5. LeetCode 탭을 새로 고친 뒤 Java 코드를 제출합니다. 확장의 대기 목록, GitHub Actions 실행, 생성된 PR의 `Solution.java`를 확인합니다.

확장 업데이트 뒤에도 LeetCode 탭을 새로 고칩니다. 토큰은 확장 로컬 저장소에 보관하며 페이지 스크립트에 전달하지 않습니다. 로그인 쿠키는 읽거나 GitHub로 보내지 않습니다. 공용 기기에는 토큰을 저장하지 않습니다.

## 수집과 원문 보관

제출 요청의 `typed_code`를 응답의 `submission_id`와 연결합니다. 공백, 줄바꿈, 주석을 바꾸지 않습니다. **Accepted 판정만 GitHub로 전송**하며 오답, 컴파일 오류, 실행 오류 등은 로컬 임시 원문을 삭제합니다. Actions에서도 정답이 아닌 제출은 PR을 만들지 않습니다.

판정을 아직 모르면 원문을 대기열에만 보관합니다. 탭을 일찍 닫거나 조회가 실패했다면, 로그인한 LeetCode 탭을 열고 확장에서 `판정 재확인`을 누릅니다. 정답 여부를 모르는 채로 전송하지 않습니다.

```text
study/<member>/<problem-slug>/submissions/<submission-id>/Solution.java
study/<member>/<problem-slug>/submissions/<submission-id>/submission.json
```

브랜치는 `leetcode/<member>/<problem-slug>/<submission-id>`입니다. 같은 제출을 다시 보내면 기존 PR을 사용합니다. 같은 ID의 내용이 달라지면 덮어쓰지 않으며, 닫은 PR은 다시 열지 않습니다. PR은 자동 병합하지 않습니다. GITHUB_TOKEN으로 만든 PR의 CI는 별도로 dispatch합니다.

실행 요청 접수는 PR 생성 완료와 다릅니다. 브라우저가 실행되는 동안 주기적으로 대기 항목 하나씩 PR과 정확한 head 커밋의 Java 파일을 확인합니다. **수집한 원문과 같은 코드가 PR에 있음을 확인한 뒤에만 로컬 원문을 정리**합니다. 확인이 실패하거나 코드가 다르면 원문을 유지하며 `PR 확인` 버튼으로 다시 확인할 수 있습니다. API 한도나 브라우저 절전 상태에 따라 확인이 늦어질 수 있습니다.

미확인 대기열에는 기존 30건 제한을 두지 않습니다. 완료 이력은 원문 없이 PR 링크만 최근 30건을 보관하므로 완료된 제출이 새 원문 저장을 막지 않습니다. 전송 실패는 `다시 전송`으로 복구하며, 브라우저 저장 공간 자체의 오류는 확장 아이콘의 `!`로 알립니다. 사용자가 `로컬 기록 삭제`를 누른 항목은 복구할 수 없습니다.

## 수집 범위와 공개 정보

설정한 브라우저에서 확장을 켠 뒤 새로 제출한 Java 코드가 대상입니다. 과거 이력, 다른 브라우저의 제출을 자동 수집하지 않습니다. 코드는 UTF-8 기준 40KB 이하, 전송 JSON은 60KB 이하입니다. 계정, 판정과 시각은 브라우저가 전달한 값이며 서버에서 LeetCode와 독립 대조한 증거는 아닙니다. 내부 웹 API가 바뀌면 수집기 수정이 필요할 수 있습니다.

코드, PR과 워크플로 로그는 공개됩니다. 크기를 초과하거나 Notion 링크 패턴이 있는 코드는 보내지 않지만, 임의의 비밀이나 개인정보를 자동 판별하지는 못합니다. 비공개 참고자료, 제삼자의 경험담, 개인 문서 링크와 키를 코드에 넣지 않습니다.

## 검증

Node.js 22.16 이상을 사용하며 외부 npm 의존성은 없습니다.

```sh
npm test
npm run check:public
```

모의 브라우저와 API로 정답만 전송, 30건 초과 보관, 확인된 원문의 정리, 불일치와 통신 실패 시 보존, 중복 PR 방지를 확인합니다. 실제 Chrome 설치, LeetCode 제출과 Actions를 연결한 검증은 별도로 필요합니다. 공개 검사는 모든 민감한 내용을 판별하지 않습니다.

문제집: [LeetCode 75](https://leetcode.com/studyplan/leetcode-75/), [Top Interview Questions Easy](https://leetcode.com/explore/interview/card/top-interview-questions-easy/). 제출 감지 방식은 [LeetHub 3.0](https://github.com/raphaelheinz/LeetHub-3.0)을 참고해 별도로 작성했습니다. 자동 확인은 [Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms), [GitHub PR 조회](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests), [파일 조회](https://docs.github.com/en/rest/repos/contents#get-repository-content)를 사용합니다.
