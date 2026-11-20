import test from 'node:test';
import assert from 'node:assert/strict';

let fixtureId = 0;
const source = '\r\nclass Solution { // 원문  \r\n}\r\n';
const settings = { enabled: true, repository: 'study/team', member: 'learner', leetcode: 'candidate', token: 'fixture-token' };
const page = { tab: { id: 1 }, frameId: 0, url: 'https://leetcode.com/problems/example/' };
const options = { url: 'chrome-extension://fixture/options.html' };
const item = id => ({ submissionId: String(id), slug: 'example', language: 'java', code: source, status: 'Pending', timestamp: 1700000000, leetcode: 'candidate' });
const record = (id, status = 'Accepted') => ({ submission: { ...item(id), status }, state: 'dispatched', repository: settings.repository, member: settings.member });
const json = value => new Response(JSON.stringify(value));

async function fixture(t, initial = {}) {
  let now = 1700000000000;
  const saved = { settings: { ...settings }, queue: [], ...structuredClone(initial) };
  const originals = { chrome: globalThis.chrome, fetch: globalThis.fetch, now: Date.now };
  let listener, alarm, rejectFetch = false;
  const requests = [], tabs = [], badges = [], receipts = new Map();
  globalThis.chrome = {
    storage: { local: {
      setAccessLevel: async () => {},
      get: async () => structuredClone(saved),
      set: async values => Object.assign(saved, structuredClone(values)),
    } },
    runtime: { getURL: path => `chrome-extension://fixture/${path}`, openOptionsPage() {}, onMessage: { addListener: fn => { listener = fn; } } },
    action: { onClicked: { addListener() {} }, setBadgeText: async value => badges.push(value.text) },
    alarms: { get: async () => undefined, create: async () => {}, onAlarm: { addListener: fn => { alarm = fn; } } },
    tabs: { query: async () => [{ id: 1 }], sendMessage: async (...args) => { tabs.push(args); return { started: true }; } },
  };
  Date.now = () => now;
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (rejectFetch) throw new Error('fixture network failure');
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/dispatches')) return new Response(null, { status: 204 });
    if (parsed.pathname.endsWith('/pulls')) {
      const branch = parsed.searchParams.get('head').slice('study:'.length);
      const id = branch.split('/').at(-1);
      return json(receipts.has(id) ? [{ number: Number(id), head: { ref: branch, sha: 'a'.repeat(40), repo: { full_name: 'study/team' } }, base: { ref: 'main' } }] : []);
    }
    if (parsed.pathname.includes('/contents/')) {
      const id = parsed.pathname.split('/').at(-2), code = receipts.get(id);
      return json({ type: 'file', encoding: 'base64', size: Buffer.byteLength(code), content: Buffer.from(code).toString('base64') });
    }
    throw new Error(`Unexpected ${url}`);
  };
  t.after(() => { globalThis.chrome = originals.chrome; globalThis.fetch = originals.fetch; Date.now = originals.now; });
  await import(new URL(`../extension/background.mjs?fixture=${++fixtureId}`, import.meta.url));
  const send = (message, sender = page) => new Promise(resolve => listener(message, sender, resolve));
  const accept = async id => {
    await send({ type: 'pending', submission: item(id) });
    return send({ type: 'verdict', submissionId: String(id), leetcode: 'candidate', status: 'Accepted' });
  };
  return { saved, send, accept, requests, tabs, badges, receipts,
    tick: async () => { now += 60000; await alarm({ name: 'confirm-submission' }); },
    offline: () => { rejectFetch = true; }, online: () => { rejectFetch = false; },
  };
}

test('wrong answers are removed locally and neither unknown nor failed verdicts reach GitHub', async t => {
  const f = await fixture(t);
  for (const status of ['Wrong Answer', 'Time Limit Exceeded', 'Runtime Error', 'Compile Error']) {
    await f.send({ type: 'pending', submission: item(1) });
    await f.send({ type: 'verdict', submissionId: '1', leetcode: 'candidate', status });
    assert.equal(f.saved.queue.length, 0);
  }
  await f.send({ type: 'pending', submission: item(2) });
  await f.send({ type: 'verdict', submissionId: '2', leetcode: 'candidate', status: 'Pending' });
  await f.send({ type: 'retry', id: '2' }, options);
  assert.equal(f.saved.queue[0].submission.code, source);
  assert.equal(f.tabs[0][1].type, 'recheck');
  assert.equal(f.requests.length, 0);
});

test('more than 30 accepted submissions are preserved until actual PR source is confirmed', async t => {
  const f = await fixture(t);
  for (let id = 1; id <= 35; id++) assert.deepEqual(await f.accept(id), {});
  assert.equal(f.saved.queue.length, 35);
  assert.equal(f.requests.filter(r => r.options.method === 'POST').length, 35);
  await f.tick();
  assert.equal(f.saved.queue.length, 35); // 204 접수만으로 원문을 삭제하지 않는다.
  for (let id = 1; id <= 35; id++) f.receipts.set(String(id), source);
  for (let i = 0; i < 40; i++) await f.tick();
  assert.equal(f.saved.queue.length, 0);
  assert.equal(f.saved.history.length, 30);
  assert.equal(JSON.stringify(f.saved.history).includes('class Solution'), false);
  assert.deepEqual(await f.accept(36), {});
  assert.equal(f.saved.queue[0].submission.submissionId, '36');
});

test('a full old dispatched queue does not block the next source, and old wrong answers are discarded', async t => {
  const f = await fixture(t, { queue: [...Array.from({ length: 30 }, (_, i) => record(i + 1)), record(90, 'Wrong Answer')] });
  await f.accept(31);
  assert.equal(f.saved.queue.length, 31);
  assert.equal(f.saved.queue.at(-1).submission.code, source);
  assert.equal(f.saved.queue.some(r => r.submission.status === 'Wrong Answer'), false);
});

test('old unconfirmed submissions do not starve confirmation of later PRs', async t => {
  const f = await fixture(t, { queue: Array.from({ length: 30 }, (_, i) => record(i + 1)) });
  for (let id = 6; id <= 30; id++) f.receipts.set(String(id), source);
  for (let i = 0; i < 35; i++) await f.tick();
  assert.equal(f.saved.queue.length, 5);
  assert.equal(f.saved.history.length, 25);
  assert.ok(f.saved.queue.every(item => Number(item.submission.submissionId) <= 5));
});

test('missing PR, different PR source and API failures preserve retryable original code', async t => {
  const f = await fixture(t); await f.accept(1);
  await f.tick(); assert.equal(f.saved.queue[0].submission.code, source);
  f.receipts.set('1', 'class Different {}');
  await f.send({ type: 'confirm', id: '1' }, options);
  assert.equal(f.saved.queue[0].submission.code, source);
  assert.match(f.saved.queue[0].message, /원문과 다릅니다/);
  f.offline(); await f.send({ type: 'confirm', id: '1' }, options);
  assert.equal(f.saved.queue[0].submission.code, source);
  f.online(); f.receipts.set('1', source);
  await f.send({ type: 'retry', id: '1' }, options);
  assert.equal(f.saved.queue.length, 0);
  assert.equal(f.requests.filter(r => r.options.method === 'POST').length, 1);
});

test('failed dispatch keeps source, duplicate verdict does not redispatch, unauthorized messages are ignored', async t => {
  const f = await fixture(t); f.offline(); await f.accept(1);
  assert.equal(f.saved.queue[0].state, 'failed');
  assert.equal(f.saved.queue[0].submission.code, source);
  f.online();
  await f.send({ type: 'verdict', submissionId: '1', leetcode: 'candidate', status: 'Accepted' });
  assert.equal(f.requests.filter(r => r.options.method === 'POST').length, 1);
  const blocked = await f.send({ type: 'pending', submission: item(2) }, { ...page, url: 'https://evil.example/' });
  assert.ok(blocked.error);
  assert.equal(f.saved.queue.length, 1);
  await f.send({ type: 'retry', id: '1' }, options);
  assert.equal(f.requests.filter(r => r.options.method === 'POST').length, 2);
});
