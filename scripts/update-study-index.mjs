import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { readConfig, fetchProblem } from '../lib/core.mjs';
import { githubClient } from '../lib/github.mjs';
import { buildStudyIndex, replaceStudyIndex } from '../lib/study-index.mjs';
import { publishStudyIndex } from '../lib/publish-study-index.mjs';

try {
  if (process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('기본 브랜치에서만 목록을 갱신할 수 있습니다.');
  const root = process.cwd();
  const config = await readConfig(root);
  const index = await buildStudyIndex({ root, getProblem: slug => fetchProblem(config, slug, { timeoutMs: 10000 }) });
  const readme = await readFile('README.md', 'utf8');
  const updated = replaceStudyIndex(readme, index.table);
  const files = [...index.files, ...(updated === readme ? [] : [{ path: 'README.md', content: updated }])];
  const result = await publishStudyIndex({
    github: githubClient({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN }),
    repository: process.env.GITHUB_REPOSITORY,
    baseSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), files,
  });
  if (index.warnings.length) console.warn(`난이도 조회 실패 ${index.warnings.length}건: 워크플로를 다시 실행하면 재조회합니다.`);
  console.log(result.number ? `목록 갱신 PR #${result.number}` : '목록 변경이 없습니다.');
} catch (error) {
  console.error(error instanceof SyntaxError ? '학습 목록 JSON 형식을 확인하세요.' : error.message);
  process.exitCode = 1;
}
