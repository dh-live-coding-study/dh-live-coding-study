import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../extension/capture.js', import.meta.url), 'utf8');
const code = '\r\nclass Solution { // exact 한글  \r\n}\r\n';
async function fixture({ accepted = false, unresolved = false } = {}) {
  const events = [], listeners = [], requests = [];
  class XHR {
    open() {} send() { this.status = 200; this.responseText = '{"submission_id":67890}'; this.onload?.(); }
    addEventListener(name, callback) { if (name === 'load') this.onload = callback; }
    removeEventListener(name, callback) { if (name === 'load' && this.onload === callback) this.onload = null; }
  }
  const window = { addEventListener: (name, listener) => listeners.push(listener), postMessage: event => events.push(event),
    fetch: async (url, init) => {
      requests.push({ url, init });
      const path = url instanceof Request ? new URL(url.url).pathname : url;
      const data = path === '/graphql/' ? { data: { userStatus: { username: 'candidate' } } }
        : String(path).includes('/check/') ? { state: unresolved ? 'PENDING' : 'SUCCESS', status_msg: accepted ? 'Accepted' : 'Wrong Answer' } : { submission_id: 12345 };
      return new Response(JSON.stringify(data));
    } };
  vm.runInNewContext(source, { window, location: { origin: 'https://leetcode.com', href: 'https://leetcode.com/problems/example-problem/' }, XMLHttpRequest: XHR, URL, Request, setTimeout: callback => callback(), console });
  const enable = value => listeners.forEach(listener => listener({ source: window, origin: 'https://leetcode.com', data: { channel: 'dh-leetcode-submission-v1', type: 'configure', enabled: value } }));
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
  return { window, XHR, events, requests, enable, settle };
}

test('fetch capture binds exact submitted source to returned ID and preserves failed verdicts', async () => {
  const f = await fixture(); f.enable(true);
  const response = await f.window.fetch('/problems/example-problem/submit/', { method: 'POST', body: JSON.stringify({ lang: 'java', typed_code: code }) });
  assert.equal((await response.json()).submission_id, 12345);
  await f.settle();
  const pending = f.events.find(item => item.type === 'pending').submission;
  const verdict = f.events.find(item => item.type === 'verdict');
  assert.equal(pending.code, code); assert.equal(pending.submissionId, '12345');
  assert.equal(verdict.status, 'Wrong Answer');
  assert.equal(verdict.submissionId, pending.submissionId);
  assert.equal(verdict.code, undefined);
  assert.equal(f.events.filter(item => item.type === 'pending').length, 1);
  assert.equal(f.requests.some(item => String(item.url).includes('github')), false);
});

test('XHR and Request inputs work, while disabled, foreign-origin and non-Java submissions are ignored', async () => {
  const f = await fixture({ accepted: true });
  const body = JSON.stringify({ lang: 'java', typed_code: code });
  await f.window.fetch('/problems/example-problem/submit/', { method: 'POST', body }); await f.settle();
  assert.equal(f.events.some(item => item.type === 'pending'), false);
  f.enable(true);
  await f.window.fetch('https://other.example/problems/example-problem/submit/', { method: 'POST', body });
  await f.window.fetch('/problems/example-problem/submit/', { method: 'POST', body: JSON.stringify({ lang: 'python3', typed_code: 'pass' }) });
  const xhr = new f.XHR(); xhr.open('POST', '/problems/example-problem/submit/'); xhr.send(body);
  await f.window.fetch(new Request('https://leetcode.com/problems/example-problem/submit/', { method: 'POST', body }));
  await f.settle();
  const ready = f.events.filter(item => item.type === 'verdict');
  assert.equal(ready.length, 2);
  assert.ok(ready.every(item => item.status === 'Accepted'));
  assert.ok(f.events.filter(item => item.type === 'pending').every(item => item.submission.code === code));
});


test('unresolved verdict remains pending instead of being sent as an accepted submission', async () => {
  const f = await fixture({ unresolved: true }); f.enable(true);
  await f.window.fetch('/problems/example-problem/submit/', { method: 'POST', body: JSON.stringify({ lang: 'java', typed_code: code }) });
  await f.settle();
  assert.equal(f.events.find(item => item.type === 'pending').submission.code, code);
  assert.equal(f.events.filter(item => item.type === 'verdict').at(-1).status, 'Pending');
  assert.equal(f.requests.filter(item => String(item.url).includes('/check/')).length, 45);
});
