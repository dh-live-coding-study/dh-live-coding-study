import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchProblem } from '../lib/core.mjs';
import { chatCompletionsClient, providerSettings } from '../lib/llm.mjs';

test('provider configuration and token limits reach the Chat Completions request', async () => {
  const settings = providerSettings({ llm: { protocol: 'chat-completions', baseUrl: 'https://default.example/v1', model: 'default' } },
    { LLM_BASE_URL: 'https://provider.example/v1', LLM_MODEL: 'chosen', LLM_API_KEY: 'fixture-key' });
  const messages = [{ role: 'user', content: 'My explanation.' }];
  const client = chatCompletionsClient(settings, { maxCompletionTokens: 1600, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://provider.example/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer fixture-key');
    assert.deepEqual(JSON.parse(options.body), { model: 'chosen', messages, stream: false, store: false, max_completion_tokens: 1600 });
    return Response.json({ choices: [{ message: { content: 'Why this approach?' }, finish_reason: 'stop' }] });
  } });
  assert.equal((await client.complete(messages)).text, 'Why this approach?');
  assert.throws(() => providerSettings({}, {}), error => error.kind === 'configuration');
});

test('API failures expose a safe category without response bodies or partial answers', async () => {
  const settings = { baseUrl: 'https://provider.example', model: 'test', apiKey: 'fixture-key' };
  const denied = chatCompletionsClient(settings, { fetchImpl: async () => new Response('fixture-sensitive-response', { status: 401 }) });
  await assert.rejects(denied.complete([]), error => error.kind === 'http' && error.status === 401 && !error.message.includes('fixture-sensitive'));
  const truncated = chatCompletionsClient(settings, { fetchImpl: async () => Response.json({ choices: [{ message: { content: 'partial' }, finish_reason: 'length' }] }) });
  await assert.rejects(truncated.complete([]), error => error.kind === 'incomplete');
});

test('problem material includes the statement and examples without hints or solutions', async () => {
  const problem = await fetchProblem({ apiBaseUrl: 'https://problems.example' }, 'example-problem', { fetchImpl: async url => {
    assert.equal(url, 'https://problems.example/select?titleSlug=example-problem');
    return Response.json({ titleSlug: 'example-problem', questionTitle: 'Example', question: 'Compare two numbers.', exampleTestcases: '1 2', hints: ['Use max'], solution: 'secret solution' });
  } });
  assert.equal(problem.examples, '1 2');
  assert.equal(problem.statement, 'Compare two numbers.');
  assert.equal(JSON.stringify(problem).includes('secret solution'), false);
  assert.equal(Object.hasOwn(problem, 'hints'), false);
});
