# DH live coding study

Java로 LeetCode 문제를 풀고 영어로 풀이를 설명하는 팀 스터디 저장소입니다.

현재 포함된 것은 공개 파일 검사, GitHub Actions CI, 작업 지침과 [Java 영어 면접 코칭 스킬](skills/java-live-coding-coach/SKILL.md)입니다. 제출 수집과 댓글 면접은 각각 별도 PR에서 추가합니다.

Node.js 22.16 이상을 사용하며 외부 npm 의존성은 없습니다.

```sh
npm test
npm run check:public
```

아직 기능 테스트는 없습니다. CI는 PR과 `leetcode/**` 브랜치의 push에서 실행합니다. 코드 변경은 작업 브랜치의 PR로 제출하고, 별도 에이전트의 검토와 필요한 검증을 거친 뒤 대표자가 병합합니다.

공개 저장소에는 비공개 참고자료, 개인 문서 링크, 제삼자의 경험담과 키를 올리지 않습니다. `check:public`은 제한 경로와 특정 링크를 검사하며 모든 민감정보를 판별하지는 않습니다.

코칭 스킬은 구어체 영어, 풀이 논리와 실제 사용한 Java 기능을 질문하는 공개용 지침입니다. 비공개 참고자료는 포함하지 않습니다.

문제집: [LeetCode 75](https://leetcode.com/studyplan/leetcode-75/), [Top Interview Questions Easy](https://leetcode.com/explore/interview/card/top-interview-questions-easy/).
