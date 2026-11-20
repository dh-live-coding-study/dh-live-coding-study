import { readFile } from 'node:fs/promises';
import { readConfig, fetchProblem } from '../lib/core.mjs';
import { githubClient } from '../lib/github.mjs';
import { chatCompletionsClient, providerSettings } from '../lib/llm.mjs';
import { runPrInterview, interviewLimits } from '../lib/pr-interview.mjs';

try {
  if (process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('면접은 기본 브랜치에서만 실행합니다.');
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const config = await readConfig(process.cwd());
  const result = await runPrInterview({
    github: githubClient({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN }),
    config, repository: process.env.GITHUB_REPOSITORY, number: Number(process.env.INTERVIEW_PR || event.issue?.number),
    actor: process.env.GITHUB_ACTOR, triggerCommentId: event.comment?.id,
    root: process.cwd(), getProblem: slug => fetchProblem(config, slug),
    client: { complete: messages => chatCompletionsClient(providerSettings(config), { maxCompletionTokens: interviewLimits(config).maxOutputTokens }).complete(messages) },
  });
  console.log(JSON.stringify(result));
  if (result.failed) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof SyntaxError ? '면접 입력 형식을 확인하세요.' : error.message);
  process.exitCode = 1;
}
