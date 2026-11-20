import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchSubmission, confirmSubmission } from '../extension/delivery.mjs';
const repository = 'study/team';
const code = '\r\nclass Solution { // 원문  \r\n}\r\n';
const input = { submissionId: '12345', slug: 'example-problem', language: 'java', code, status: 'Accepted', timestamp: 1700000000, leetcode: 'sample-user' };

test('browser dispatch sends only submission and member, never cookies or the GitHub token in payload', async () => {
  const settings = { enabled: true, repository, member: 'learner', leetcode: 'sample-user', token: 'fixture-token' };
  const result = await dispatchSubmission(settings, input, async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/study/team/actions/workflows/import-submission.yml/dispatches');
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    assert.equal(options.body.includes('fixture-token'), false);
    assert.equal(options.credentials, 'omit');
    const body = JSON.parse(options.body);
    assert.equal(body.ref, 'main');
    assert.equal(JSON.parse(body.inputs.submission).code, code);
    return new Response(null, { status: 204 });
  });
  assert.equal(result.state, 'dispatched');
  await assert.rejects(dispatchSubmission(settings, { ...input, slug: '../escape' }), /slug/);
  await assert.rejects(dispatchSubmission(settings, { ...input, code: '// https://' + 'app.notion.com/private' }), /문서 링크/);
  await assert.rejects(dispatchSubmission(settings, input, async () => new Response('credential-body', { status: 403 })), error => error.message.includes('403') && !error.message.includes('credential-body'));
});


test('non-accepted and unknown verdicts are never sent to GitHub', async () => {
  const settings = { enabled: true, repository, member: 'learner', leetcode: 'sample-user', token: 'fixture-token' };
  for (const status of ['Wrong Answer', 'Time Limit Exceeded', 'Runtime Error', 'Pending']) {
    await assert.rejects(dispatchSubmission(settings, { ...input, status }, () => { throw new Error('must not request'); }), /정답 판정/);
  }
});

test('source confirmation falls back to the legacy path only when the new file is missing', async () => {
  const settings = { enabled: true, repository, member: 'learner', leetcode: 'sample-user', token: 'fixture-token' };
  const branch = 'leetcode/learner/example-problem/12345', sha = 'a'.repeat(40);
  const current = '/repos/study/team/contents/study/example-problem/learner/submissions/12345/Solution.java';
  const legacy = '/repos/study/team/contents/study/learner/example-problem/submissions/12345/Solution.java';
  for (const layout of ['current', 'legacy', 'different', 'forbidden']) {
    const paths = [];
    const fetchImpl = async url => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/pulls')) return Response.json([{ number: 7, head: { ref: branch, sha, repo: { full_name: repository } }, base: { ref: 'main' } }]);
      paths.push(parsed.pathname);
      assert.equal(parsed.searchParams.get('ref'), sha);
      if (layout === 'legacy' && parsed.pathname === current) return new Response(null, { status: 404 });
      if (layout === 'forbidden') return new Response(null, { status: 403 });
      const text = layout === 'different' ? 'class Different {}' : code;
      return Response.json({ type: 'file', encoding: 'base64', size: Buffer.byteLength(text), content: Buffer.from(text).toString('base64') });
    };
    if (layout === 'different') await assert.rejects(confirmSubmission(settings, input, fetchImpl), /원문과 다릅니다/);
    else if (layout === 'forbidden') await assert.rejects(confirmSubmission(settings, input, fetchImpl), /403/);
    else assert.equal(await confirmSubmission(settings, input, fetchImpl), 'https://github.com/study/team/pull/7');
    assert.deepEqual(paths, layout === 'legacy' ? [current, legacy] : [current]);
  }
});
