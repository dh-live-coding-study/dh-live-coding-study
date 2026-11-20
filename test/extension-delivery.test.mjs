import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchSubmission } from '../extension/delivery.mjs';
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
