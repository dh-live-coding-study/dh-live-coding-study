import test from 'node:test';
import assert from 'node:assert/strict';
import { publishStudyIndex } from '../lib/publish-study-index.mjs';

function fixture({ existing = false, current = 'main-sha' } = {}) {
  const calls = [], pulls = existing ? [{ number: 7 }] : [];
  const github = {
    async list() { return pulls; },
    async request(path, options = {}) {
      calls.push({ path, ...options });
      if (path === '/git/ref/heads/main') return { object: { sha: current } };
      if (path === '/git/commits/main-sha') return { tree: { sha: 'main-tree' } };
      if (path === '/git/ref/heads/leetcode/readme-index') return existing ? { object: { sha: 'previous-head' } } : null;
      if (path === '/git/blobs') return { sha: 'blob' };
      if (path === '/git/trees') return { sha: 'tree' };
      if (path === '/git/commits') return { sha: 'new-head' };
      if (path === '/git/refs' || path === '/git/refs/heads/leetcode/readme-index') return {};
      if (path === '/pulls') { const pr = { number: 8 }; pulls.push(pr); return pr; }
      if (path === '/actions/workflows/ci.yml/dispatches') return null;
      throw new Error(`Unexpected ${path}`);
    },
  };
  return { calls, run: files => publishStudyIndex({ github, repository: 'study/team', baseSha: 'main-sha', files }) };
}

test('the index gets a separate PR and CI while main and submission PRs remain untouched', async () => {
  const f = fixture();
  assert.deepEqual(await f.run([{ path: 'README.md', content: 'table' }, { path: 'study/two-sum/problem.json', content: '{}' }]), { number: 8 });
  assert.deepEqual(f.calls.find(call => call.path === '/git/trees').body, { base_tree: 'main-tree', tree: [
    { path: 'README.md', mode: '100644', type: 'blob', sha: 'blob' },
    { path: 'study/two-sum/problem.json', mode: '100644', type: 'blob', sha: 'blob' },
  ] });
  assert.deepEqual(f.calls.find(call => call.path === '/git/commits').body.parents, ['main-sha']);
  assert.equal(f.calls.find(call => call.path === '/git/refs').body.ref, 'refs/heads/leetcode/readme-index');
  assert.equal(f.calls.find(call => call.path === '/pulls').body.base, 'main');
  assert.equal(f.calls.at(-1).body.ref, 'leetcode/readme-index');
});

test('an open index PR is reused without force-pushing or creating another PR', async () => {
  const f = fixture({ existing: true });
  assert.deepEqual(await f.run([{ path: 'README.md', content: 'updated' }]), { number: 7 });
  assert.deepEqual(f.calls.find(call => call.path === '/git/commits').body.parents, ['main-sha', 'previous-head']);
  assert.deepEqual(f.calls.find(call => call.method === 'PATCH'), { path: '/git/refs/heads/leetcode/readme-index', method: 'PATCH', body: { sha: 'new-head', force: false } });
  assert.equal(f.calls.some(call => call.path === '/pulls'), false);
});

test('no changes, unrelated paths and a moved main do not write any repository state', async () => {
  const f = fixture(); assert.deepEqual(await f.run([]), { number: 0 });
  await assert.rejects(f.run([{ path: '.github/workflows/evil.yml', content: '' }]), /README와 문제 정보/);
  assert.equal(f.calls.length, 0);
  const g = fixture({ current: 'new-main' });
  await assert.rejects(g.run([{ path: 'README.md', content: '' }]), /main이 변경/);
  assert.equal(g.calls.some(call => call.method), false);
});
