import { createHash } from 'node:crypto';
import { validateSubmission, submissionPaths } from '../extension/submission.mjs';

export const sourceHash = code => createHash('sha256').update(code, 'utf8').digest('hex');

export async function importSubmission({ github, config, repository, actor, memberId, input }) {
  const member = config.members.find(item => item.id === memberId);
  if (!member?.github || member.github.toLowerCase() !== actor?.toLowerCase()) throw new Error('등록된 참여자 본인의 GitHub 계정으로 실행하세요.');
  if (input.leetcode?.toLowerCase() !== member.leetcode.toLowerCase()) throw new Error('설정한 LeetCode 계정의 제출이 아닙니다.');
  const item = validateSubmission(input);
  if (item.status !== 'Accepted') return { number: 0 };
  const paths = submissionPaths(member.id, item);
  const metadata = { version: 1, member: member.id, leetcode: member.leetcode, github: member.github,
    submissionId: item.submissionId, slug: item.slug, language: item.language, status: item.status,
    capturedAt: item.timestamp, sourceSha256: sourceHash(item.code),
    source: 'browser-submit-request', url: `https://leetcode.com/submissions/detail/${item.submissionId}/` };
  const serialized = JSON.stringify(metadata, null, 2) + '\n';
  const runCi = () => github.request('/actions/workflows/ci.yml/dispatches', { method: 'POST', body: { ref: paths.branch } });
  const refPath = `/git/ref/heads/${paths.branch}`;
  let ref = await github.request(refPath, { optional: true });
  if (ref) {
    const code = await github.readText(paths.code, ref.object.sha);
    const existing = await github.readText(paths.metadata, ref.object.sha);
    if (code !== item.code || existing !== serialized) throw new Error('같은 제출 ID에 다른 기록이 있습니다. 기존 브랜치를 변경하지 않았습니다.');
  } else {
    const base = await github.request('/git/ref/heads/main');
    const commit = await github.request(`/git/commits/${base.object.sha}`);
    // 기본 브랜치의 같은 제출도 덮어쓰지 않는다.
    const existing = await github.readText(paths.metadata, base.object.sha);
    const existingCode = await github.readText(paths.code, base.object.sha);
    if (existing !== null || existingCode !== null) {
      if (existing !== serialized || existingCode !== item.code) throw new Error('기본 브랜치에 다른 제출 기록이 있습니다.');
      return { number: 0, alreadyImported: true };
    }
    const entries = [];
    for (const [path, content] of [[paths.code, item.code], [paths.metadata, serialized]]) {
      const blob = await github.request('/git/blobs', { method: 'POST', body: { content: Buffer.from(content, 'utf8').toString('base64'), encoding: 'base64' } });
      entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const tree = await github.request('/git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree: entries } });
    const created = await github.request('/git/commits', { method: 'POST', body: { message: `study: ${member.id} ${item.slug} (${item.submissionId})`, tree: tree.sha, parents: [base.object.sha] } });
    await github.request('/git/refs', { method: 'POST', body: { ref: `refs/heads/${paths.branch}`, sha: created.sha } });
  }
  const pulls = await github.list(`/pulls?state=all&head=${encodeURIComponent(repository.split('/')[0] + ':' + paths.branch)}&base=main`);
  if (pulls.length) {
    const number = pulls.find(pr => pr.state === 'open')?.number || 0;
    if (number) await runCi();
    return { number, alreadyImported: true };
  }
  const pr = await github.request('/pulls', { method: 'POST', body: {
    title: `[${member.id}] ${item.slug} #${item.submissionId}`, head: paths.branch, base: 'main',
    body: `@${member.github} 님의 정답 Java 제출입니다. 브라우저가 해당 제출 요청의 코드 원문을 수집했습니다.\n\n[LeetCode 제출](${metadata.url})\n\n첫 면접 질문에 영어 댓글로 답하면 다음 질문이 이어집니다. 힌트는 \`/hint\`, 한국어 종합 피드백과 종료는 \`/finish\`를 사용하세요. 실패한 요청만 \`/retry\`로 재시도할 수 있습니다.\n\n코드와 댓글은 공개되며 LLM 제공자에게 전달됩니다. 제출 코드는 실행하지 않습니다. 제출 결과는 브라우저가 전달한 값이며 서버에서 독립 검증하지 않습니다.`,
  } });
  // GITHUB_TOKEN으로 만든 PR은 pull_request 워크플로를 촉발하지 않는다.
  // workflow_dispatch는 예외이므로 같은 제출 브랜치에서 검증을 명시적으로 시작한다.
  await runCi();
  return { number: pr.number, url: pr.html_url };
}
