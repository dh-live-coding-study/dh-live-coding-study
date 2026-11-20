import { readFile, appendFile } from 'node:fs/promises';
import { readConfig } from '../lib/core.mjs';
import { githubClient } from '../lib/github.mjs';
import { authorizePrInterview } from '../lib/pr-interview.mjs';

try {
  if (process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('기본 브랜치에서만 확인합니다.');
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const allowed = await authorizePrInterview({
    github: githubClient({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN }),
    config: await readConfig(process.cwd()), repository: process.env.GITHUB_REPOSITORY,
    number: Number(process.env.INTERVIEW_PR || event.issue?.number), actor: process.env.GITHUB_ACTOR,
    triggerCommentId: event.comment?.id,
  });
  await appendFile(process.env.GITHUB_OUTPUT, `allowed=${allowed}\n`);
} catch {
  console.error('면접 호출자를 확인하지 못했습니다. Actions의 실행 계정과 PR을 확인하세요.');
  process.exitCode = 1;
}
