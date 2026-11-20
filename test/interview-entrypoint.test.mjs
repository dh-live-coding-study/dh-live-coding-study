import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sourceHash } from '../lib/import-submission.mjs';

test('the Actions entry point exits unsuccessfully on LLM failure and preserves a safe failed comment', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dh-interview-'));
  try {
    const skillPath = 'skills/java-live-coding-coach/SKILL.md';
    await mkdir(join(directory, 'skills/java-live-coding-coach'), { recursive: true });
    await copyFile(new URL(`../${skillPath}`, import.meta.url), join(directory, skillPath));
    await writeFile(join(directory, 'study.config.json'), JSON.stringify({ version: 1,
      members: [{ id: 'learner', github: 'candidate', leetcode: 'candidate-lc' }],
      apiBaseUrl: 'https://problems.example', llm: { protocol: 'chat-completions', baseUrl: 'https://llm.example/v1', model: 'fixture' } }));
    await writeFile(join(directory, 'event.json'), '{}');
    const code = 'class Solution {}';
    const metadata = { version: 1, member: 'learner', github: 'candidate', leetcode: 'candidate-lc', slug: 'example-problem', submissionId: '12345', language: 'java', status: 'Accepted', capturedAt: 1700000000, sourceSha256: sourceHash(code) };
    const base = 'study/example-problem/learner/submissions/12345';
    const preload = `
      import { writeFile } from 'node:fs/promises';
      const code = ${JSON.stringify(code)}, metadata = ${JSON.stringify(metadata)}, base = ${JSON.stringify(base)};
      globalThis.fetch = async (url, options = {}) => {
        const path = new URL(url).pathname;
        if (url.startsWith('https://llm.example/')) return new Response('fixture-sensitive-provider-body', { status: 401 });
        if (url.startsWith('https://problems.example/')) return Response.json({ titleSlug: 'example-problem', questionTitle: 'Example', question: 'Explain the code.' });
        if (path.endsWith('/pulls/7')) return Response.json({ state: 'open', base: { ref: 'main' }, head: { ref: 'leetcode/learner/example-problem/12345', sha: 'source-head', repo: { full_name: 'study/team' } }, user: { login: 'github-actions[bot]', id: 41898282 } });
        if (path.endsWith('/pulls/7/files')) return Response.json(['Solution.java', 'submission.json'].map(name => ({ filename: base + '/' + name, status: 'added' })));
        if (path.includes('/contents/')) { const text = path.endsWith('Solution.java') ? code : JSON.stringify(metadata); return Response.json({ type: 'file', encoding: 'base64', size: Buffer.byteLength(text), content: Buffer.from(text).toString('base64') }); }
        if (path.endsWith('/issues/7/comments')) return Response.json(options.method === 'POST' ? { id: 99 } : []);
        if (path.endsWith('/issues/comments/99') && options.method === 'PATCH') { await writeFile('failed-comment.json', options.body); return Response.json({ id: 99 }); }
        throw new Error('Unexpected fixture request');
      };
    `;
    await writeFile(join(directory, 'preload.mjs'), preload);
    const result = spawnSync(process.execPath, ['--import', join(directory, 'preload.mjs'), fileURLToPath(new URL('../scripts/interview-pr.mjs', import.meta.url))], {
      cwd: directory, encoding: 'utf8', timeout: 10000,
      env: { PATH: process.env.PATH, GITHUB_REF: 'refs/heads/main', GITHUB_REPOSITORY: 'study/team', GITHUB_ACTOR: 'candidate',
        INTERVIEW_PR: '7', GITHUB_EVENT_PATH: join(directory, 'event.json'), GITHUB_TOKEN: 'fixture-github-key', LLM_API_KEY: 'fixture-llm-key' },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout), { failed: true, reason: 'LLM API HTTP 401' });
    const comment = JSON.parse(await readFile(join(directory, 'failed-comment.json'), 'utf8')).body;
    const state = JSON.parse(Buffer.from(/^<!-- dh-interview:v1:(\S+) -->/.exec(comment)[1], 'base64').toString('utf8'));
    assert.equal(state.status, 'failed');
    assert.match(comment, /HTTP 401/);
    assert.match(comment, /\/retry/);
    assert.doesNotMatch(result.stdout + result.stderr + comment, /fixture-(sensitive|github-key|llm-key)/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
