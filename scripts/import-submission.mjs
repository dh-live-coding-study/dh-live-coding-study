import { readFile, appendFile } from 'node:fs/promises';
import { readConfig } from '../lib/core.mjs';
import { githubClient } from '../lib/github.mjs';
import { importSubmission } from '../lib/import-submission.mjs';

try {
  if (process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('기본 브랜치에서만 실행할 수 있습니다.');
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const result = await importSubmission({
    github: githubClient({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN }),
    config: await readConfig(process.cwd()), repository: process.env.GITHUB_REPOSITORY,
    actor: process.env.GITHUB_ACTOR, memberId: event.inputs?.member,
    input: JSON.parse(event.inputs?.submission || '{}'),
  });
  await appendFile(process.env.GITHUB_OUTPUT, `pr=${result.number}\n`);
  console.log(result.number ? `PR #${result.number}` : '이미 등록했거나 수집 조건에 맞지 않는 제출입니다.');
} catch (error) {
  // JSON 파서 등의 오류에도 소스나 토큰을 포함한 입력을 출력하지 않는다.
  console.error(error instanceof SyntaxError ? '제출 JSON 형식을 확인하세요.' : error.message);
  process.exitCode = 1;
}
