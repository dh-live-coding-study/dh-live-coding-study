import test from 'node:test';
import assert from 'node:assert/strict';
import { githubClient } from '../lib/github.mjs';

test('GitHub errors identify the failing operation without exposing credentials, queries or response bodies', async () => {
  const github = githubClient({ repository: 'study/team', token: 'private-token',
    fetchImpl: async () => new Response('private-response-body', { status: 403 }) });
  await assert.rejects(github.request('/issues/10/comments?private=query', { method: 'POST', body: { body: 'private-comment' } }), error => {
    assert.equal(error.message, 'GitHub API 요청 실패: POST /issues/10/comments (HTTP 403)');
    assert.doesNotMatch(error.message, /private/);
    return true;
  });
});
