# DH live coding study

Java 정답 제출의 원문을 GitHub PR에 기록합니다. [Java 영어 면접 코칭 스킬](skills/java-live-coding-coach/SKILL.md)은 공개용 지침입니다. 브라우저 수집과 댓글 면접은 각각 후속 PR에서 연결합니다.

## 제출 등록

이 PR과 선행 기본 설정 PR이 main에 병합돼야 `Import Java submission` 워크플로를 실행할 수 있습니다. `study.config.json`에 참여자를 등록합니다.

```json
"members": [
  { "id": "learner", "leetcode": "YOUR_LEETCODE_USERNAME", "github": "YOUR_GITHUB_LOGIN" }
]
```

수집한 정보의 LeetCode 계정과 실행한 GitHub 계정을 설정값과 대조하고, Accepted 판정만 등록합니다. 같은 제출 ID를 다시 보내도 PR과 코드를 중복 생성하거나 덮어쓰지 않습니다. Java 소스의 공백, 줄바꿈, 주석을 보존합니다.

등록 파일은 `study/<member>/<slug>/submissions/<submission-id>/Solution.java`와 `submission.json`입니다. 작업 브랜치는 `leetcode/<member>/<slug>/<submission-id>`이며, 자동 승인과 병합은 하지 않습니다. 브라우저가 사용할 입력은 workflow_dispatch의 `member`와 `submission` JSON입니다. 제출 JSON에는 `submissionId`, `slug`, `language`, `code`, `status`, `timestamp`, `leetcode`가 필요합니다.

대표자는 조직과 저장소의 `Allow GitHub Actions to create and approve pull requests`를 허용합니다. 생성과 승인이 한 설정에 묶여 있지만 구현은 PR 생성만 합니다. GITHUB_TOKEN으로 만든 PR의 CI는 별도로 dispatch합니다. main에는 PR과 CI를 요구하고 갱신 허용 대상을 대표자로 제한합니다.

코드, PR과 워크플로 로그는 공개됩니다. 비공개 참고자료, 개인 문서 링크, 제삼자의 경험담과 키를 포함하지 않습니다. 등록 정보는 브라우저에서 전달받은 값이며 LeetCode에서 독립 확인한 증거는 아닙니다. 크기와 특정 문서 링크는 검사하지만 모든 민감정보를 자동 판별하지는 않습니다.

## 검증

Node.js 22.16 이상을 사용하며 외부 npm 의존성은 없습니다.

```sh
npm test
npm run check:public
```

모의 GitHub API로 정답 필터, 원문 보존, 계정 검증, 중복과 덮어쓰기 방지를 확인합니다. 실제 Actions에서 PR을 만드는 검증은 main 병합과 참여자 설정 후 진행해야 합니다.
