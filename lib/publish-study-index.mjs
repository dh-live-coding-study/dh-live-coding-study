const branch = 'leetcode/readme-index';

export async function publishStudyIndex({ github, repository, baseSha, files }) {
  if (!files.length) return { number: 0 };
  if (files.some(file => file.path !== 'README.md' && !/^study\/[a-z0-9-]+\/problem\.json$/.test(file.path))) {
    throw new Error('목록 갱신은 README와 문제 정보만 변경할 수 있습니다.');
  }
  const base = await github.request('/git/ref/heads/main');
  if (base.object.sha !== baseSha) throw new Error('main이 변경됐습니다. 목록 갱신 워크플로를 다시 실행하세요.');
  const commit = await github.request(`/git/commits/${baseSha}`);
  const previous = await github.request(`/git/ref/heads/${branch}`, { optional: true });
  const entries = [];
  for (const file of files) {
    const blob = await github.request('/git/blobs', { method: 'POST', body: {
      content: Buffer.from(file.content, 'utf8').toString('base64'), encoding: 'base64',
    } });
    entries.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const tree = await github.request('/git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree: entries } });
  // 기존 자동 갱신 브랜치를 부모로 남겨 강제 push 없이 최신 main 기준으로 갱신한다.
  const parents = [...new Set([baseSha, ...(previous ? [previous.object.sha] : [])])];
  const created = await github.request('/git/commits', { method: 'POST', body: {
    message: 'docs: 문제별 풀이 목록 갱신', tree: tree.sha, parents,
  } });
  if (previous) await github.request(`/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha: created.sha, force: false } });
  else await github.request('/git/refs', { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: created.sha } });
  const pulls = await github.list(`/pulls?state=open&head=${encodeURIComponent(repository.split('/')[0] + ':' + branch)}&base=main`);
  const pr = pulls[0] || await github.request('/pulls', { method: 'POST', body: {
    title: '문제별 풀이 목록 갱신', head: branch, base: 'main',
    body: 'main에 병합된 정답 풀이로 README 목록을 갱신했습니다. 참여자 링크는 문제별 최신 제출 원문으로 연결됩니다. 난이도가 Unknown이면 문제 API 조회에 실패한 것이므로 목록 갱신 워크플로를 다시 실행해 주세요.',
  } });
  await github.request('/actions/workflows/ci.yml/dispatches', { method: 'POST', body: { ref: branch } });
  return { number: pr.number };
}
