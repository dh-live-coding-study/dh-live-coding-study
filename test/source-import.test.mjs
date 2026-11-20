import test from 'node:test';
import assert from 'node:assert/strict';
import { importSubmission } from '../lib/import-submission.mjs';
import { submissionPaths } from '../extension/submission.mjs';

const code = '\r\nclass Solution {\r\n  // 한글과 공백  \r\n}\r\n';
const input = { submissionId: '12345', slug: 'example-problem', language: 'java', code, status: 'Accepted', timestamp: 1700000000, leetcode: 'sample-user' };
const config = { members: [{ id: 'learner', leetcode: 'sample-user', github: 'candidate' }] };
const repository = 'study/team';
function fixture() {
  const blobs = new Map(), files = new Map(), refs = new Map(), pulls = [], calls = [];
  let index = 0;
  const github = {
    async readText(path, ref) { return files.get(`${ref}:${path}`) ?? null; },
    async list(path) { assert.match(path, /^\/pulls\?/); return pulls; },
    async request(path, options = {}) {
      calls.push({ path, ...options });
      if (path === '/git/ref/heads/main') return { object: { sha: 'main' } };
      if (path.startsWith('/git/ref/heads/')) return refs.get(path) || null;
      if (path === '/git/commits/main') return { tree: { sha: 'base-tree' } };
      if (path === '/git/blobs') { const sha = `blob-${++index}`; blobs.set(sha, Buffer.from(options.body.content, 'base64').toString('utf8')); return { sha }; }
      if (path === '/git/trees') { for (const item of options.body.tree) files.set(`head:${item.path}`, blobs.get(item.sha)); return { sha: 'new-tree' }; }
      if (path === '/git/commits') { assert.deepEqual(options.body.parents, ['main']); return { sha: 'head' }; }
      if (path === '/git/refs') { refs.set('/git/ref/' + options.body.ref.slice(5), { object: { sha: options.body.sha } }); return {}; }
      if (path === '/pulls') { const pr = { number: 7, state: 'open', html_url: 'https://github.com/study/team/pull/7' }; pulls.push(pr); return pr; }
      if (path === '/actions/workflows/ci.yml/dispatches') return null;
      throw new Error(`Unexpected ${path}`);
    },
  };
  return { github, files, calls, pulls, run: overrides => importSubmission({ github, config, repository, actor: 'candidate', memberId: 'learner', input, ...overrides }) };
}

test('source import preserves original UTF-8, CRLF and trailing spaces, retry creates no duplicate PR', async () => {
  const f = fixture();
  assert.equal((await f.run()).number, 7);
  const paths = submissionPaths('learner', input);
  assert.equal(paths.code, 'study/example-problem/learner/submissions/12345/Solution.java');
  assert.equal(f.files.get(`head:${paths.code}`), code);
  const metadata = JSON.parse(f.files.get(`head:${paths.metadata}`));
  assert.equal(metadata.status, 'Accepted');
  assert.equal(metadata.submissionId, '12345');
  assert.match(metadata.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal((await f.run()).number, 7);
  assert.equal(f.calls.filter(call => call.path === '/git/commits').length, 1);
  assert.equal(f.pulls.length, 1);
  assert.equal(f.calls.some(call => call.method === 'PATCH'), false);
  assert.equal(f.calls.find(call => call.path.includes('/dispatches')).body.ref, paths.branch);
});

test('unauthorized actor, account mismatch, missing source and changed submission fail before mutation', async () => {
  const f = fixture();
  await assert.rejects(f.run({ actor: 'other-user' }), /본인/);
  await assert.rejects(f.run({ input: { ...input, leetcode: 'other-user' } }), /계정/);
  await assert.rejects(f.run({ input: { ...input, code: '' } }), /소스/);
  assert.equal(f.calls.length, 0);
  await f.run();
  const writes = () => f.calls.filter(call => call.method === 'POST').length;
  const before = writes();
  await assert.rejects(f.run({ input: { ...input, code: 'class Changed {}' } }), /다른 기록/);
  assert.equal(writes(), before);
});

test('merged submissions and deliberately closed PRs are not overwritten or reopened', async () => {
  const f = fixture(); await f.run(); f.pulls[0].state = 'closed';
  assert.equal((await f.run()).number, 0);
  const g = fixture(); const paths = submissionPaths('learner', input);
  g.files.set(`main:${paths.code}`, 'existing source without metadata');
  await assert.rejects(g.run(), /다른 제출/);
  assert.equal(g.calls.some(call => call.method === 'POST'), false);
});



test('non-accepted submissions never create GitHub records', async () => {
  const f = fixture();
  for (const status of ['Wrong Answer', 'Time Limit Exceeded', 'Runtime Error', 'Pending']) {
    assert.equal((await f.run({ input: { ...input, status } })).number, 0);
  }
  assert.equal(f.calls.length, 0);
});

test('legacy submissions remain idempotent on open branches and after merging', async () => {
  const f = fixture(); await f.run();
  const current = submissionPaths('learner', input);
  const legacy = submissionPaths('learner', input, { legacy: true });
  for (const key of ['code', 'metadata']) {
    f.files.set(`head:${legacy[key]}`, f.files.get(`head:${current[key]}`));
    f.files.delete(`head:${current[key]}`);
  }
  assert.equal((await f.run()).number, 7);
  assert.equal(f.calls.filter(call => call.path === '/git/commits').length, 1);
  const g = fixture();
  for (const key of ['code', 'metadata']) g.files.set(`main:${legacy[key]}`, f.files.get(`head:${legacy[key]}`));
  assert.deepEqual(await g.run(), { number: 0, alreadyImported: true });
  assert.equal(g.calls.some(call => call.method === 'POST'), false);
});
