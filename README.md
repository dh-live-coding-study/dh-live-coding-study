# DH live coding study

LeetCode Java 정답을 GitHub PR로 모으고, 댓글로 영어 모의 면접을 진행합니다.

## 문제와 풀이

이름을 누르면 해당 참여자의 풀이로 이동합니다. 목록에는 main에 병합된 풀이가 표시됩니다.

<!-- study-index:start -->

| 문제 | 난이도 | 풀이 |
| --- | --- | --- |

아직 병합된 풀이가 없습니다.

<!-- study-index:end -->

## 시작하기

조직 초대를 수락하고 [study.config.json](study.config.json)에 본인의 GitHub, LeetCode 계정이 등록돼 있는지 확인하세요. 등록되지 않았다면 대표자에게 알려 주세요.

### 1. Chrome에 확장 등록

1. [최신 ZIP](https://github.com/quantum-jumpers/dh-live-coding-study/archive/refs/heads/main.zip)을 받아 압축을 풉니다.
2. Chrome 주소창에 `chrome://extensions`를 입력하고 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다(Load unpacked)** 를 누르고, `manifest.json`이 있는 **`extension/` 폴더**를 선택합니다. 설치 후에도 이 폴더는 그대로 보관합니다.

![개발자 모드를 켜고 extension 폴더를 선택하는 Chrome 등록 안내도](docs/images/extension-install.svg)

### 2. GitHub 개인 토큰 발급

[Fine-grained token 만들기](https://github.com/settings/personal-access-tokens/new)에서 이름과 만료일을 정하고 다음과 같이 설정합니다.

| 항목 | 선택할 값 |
| --- | --- |
| Resource owner | `quantum-jumpers` |
| Repository access | **Only select repositories** → `dh-live-coding-study` |
| Actions | **Read and write** |
| Contents | **Read-only** |
| Pull requests | **Read-only** |

**Generate token**을 누르고 발급한 값을 보관합니다. 다음 단계에서 사용할 개인 토큰이므로 채팅이나 PR에 공유하지 마세요.

### 3. 수집 설정

Chrome의 퍼즐 아이콘에서 **DH LeetCode submission collector**를 엽니다. [study.config.json](study.config.json)의 `members`에서 본인의 `github` 항목을 찾아 입력합니다.

| 입력란 | 입력할 값 |
| --- | --- |
| GitHub 저장소 | `quantum-jumpers/dh-live-coding-study` |
| 멤버 ID | 본인 항목의 `id` |
| LeetCode 아이디 | 본인 항목의 `leetcode` |
| GitHub fine-grained 토큰 | 방금 발급한 개인 토큰 |

![등록 정보의 id와 leetcode를 확장 입력란에 연결한 예시](docs/images/extension-settings.svg)

공개 PR 전송 동의를 체크하고 **저장**한 뒤 **LeetCode 탭을 새로 고칩니다.** 그림의 계정은 예시이므로 본인의 등록값을 사용하세요.

### 4. 정답 제출과 PR 확인

Java 풀이를 **Submit**해 **Accepted** 판정을 받으면 PR이 생성됩니다. 설치 후 새로 제출한 정답부터 수집하며, **Run**만 누르면 수집하지 않습니다.

확장 화면의 **새로 고침**을 누르고 **PR 생성 확인 이력**의 링크를 엽니다. 코드와 면접 댓글은 공개되며, 면접을 위해 AI 서비스에 전달됩니다.

## PR 댓글 면접

PR의 첫 질문에 영어 댓글로 답하면 다음 질문이 이어집니다. 한 면접은 첫 질문과 마지막 피드백을 포함해 AI 답변 최대 10개이며, 마지막에는 한국어로 피드백을 받습니다.

명령은 댓글의 별도 줄에 적습니다.

| 명령 | 하는 일 |
| --- | --- |
| `/hint` | 힌트 요청 |
| `/finish` | 종합 피드백을 받고 종료 |
| `/retry` | 실패한 요청 다시 보내기 |
| `/interview` 또는 `@github-actions[bot]` | 종료 후 새 면접 시작 |

## 문제가 생기면

| 상황 | 조치 |
| --- | --- |
| 제출이 안 보임 | 확장 화면의 **새로 고침**을 누르고, 수집이 켜져 있는지 확인한 뒤 LeetCode 탭도 새로 고칩니다. |
| 판정 대기 중 | 로그인한 LeetCode 탭을 열고 **판정 재확인**을 누릅니다. |
| 전송 실패 | 토큰 만료, 조직 승인, 등록 계정을 확인하고 **다시 전송**을 누릅니다. |
| PR이나 면접 질문이 생기지 않음 | **Actions 확인**에서 실패한 실행 링크를 대표자에게 전달합니다. |

## 확장 업데이트

최신 main의 파일로 설치한 `extension/` 폴더를 갱신합니다. `chrome://extensions`에서 확장 카드의 **새로고침**을 누르고, LeetCode 탭도 새로 고칩니다.

## 문제집

[LeetCode 75](https://leetcode.com/studyplan/leetcode-75/), [Top Interview Questions Easy](https://leetcode.com/explore/interview/card/top-interview-questions-easy/)
