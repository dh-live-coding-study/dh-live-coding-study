import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { buildStudyIndex, replaceStudyIndex } from '../lib/study-index.mjs';
import { sourceHash } from '../lib/import-submission.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'study-index-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (path, content) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content); };
  const add = async ({ slug = 'two-sum', member = 'alice', id = '9', legacy = false, status = 'Accepted', hash } = {}) => {
    const directory = `study/${legacy ? `${member}/${slug}` : `${slug}/${member}`}/submissions/${id}`;
    const code = '\r\nclass Solution { // 한글 원문  \r\n}\r\n';
    await write(`${directory}/Solution.java`, code);
    await write(`${directory}/submission.json`, JSON.stringify({ version: 1, slug, member, submissionId: id,
      language: 'java', status, capturedAt: 1700000000, sourceSha256: hash || sourceHash(code) }));
    return directory;
  };
  return { root, write, add };
}

test('one row per problem links each member to their newest accepted source, including legacy records', async t => {
  const f = await fixture(t);
  await f.add({ legacy: true }); await f.add({ id: '10' });
  await f.add({ member: 'bob', id: '11' }); await f.add({ member: 'bob', id: '12', status: 'Wrong Answer' });
  await f.add({ slug: 'add-two-numbers', id: '13' });
  const calls = [];
  const result = await buildStudyIndex({ root: f.root, getProblem: async slug => {
    calls.push(slug);
    return { slug, title: slug === 'two-sum' ? 'Two Sum' : 'Add Two Numbers', difficulty: slug === 'two-sum' ? 'Easy' : 'Medium' };
  } });
  assert.deepEqual(calls, ['add-two-numbers', 'two-sum']);
  assert.match(result.table, /\| \[Two Sum\]\(https:\/\/leetcode.com\/problems\/two-sum\/\) \| !\[Difficulty: Easy\]\(https:\/\/img.shields.io\/badge\/Difficulty-Easy-brightgreen\) \| \[alice\]\(\.\/study\/two-sum\/alice\/submissions\/10\/Solution.java\), \[bob\]\(\.\/study\/two-sum\/bob\/submissions\/11\/Solution.java\) \|/);
  assert.match(result.table, /Difficulty-Medium-orange/);
  assert.equal(result.table.includes('/12/'), false);
  assert.equal(result.files.length, 2);
  assert.equal(result.files.every(file => /study\/[^/]+\/problem.json/.test(file.path)), true);
  assert.deepEqual(result.warnings, []);
});

test('cached titles and badges need no API and cannot inject Markdown or HTML', async t => {
  const f = await fixture(t); await f.add({ legacy: true });
  await f.write('study/two-sum/problem.json', JSON.stringify({ slug: 'two-sum', title: 'A | [link](url) <img>\nB', difficulty: 'Hard' }));
  const result = await buildStudyIndex({ root: f.root, getProblem: () => { throw new Error('cache must be used'); } });
  assert.match(result.table, /Difficulty-Hard-red/);
  assert.match(result.table, /A &#124; &#91;link&#93;\(url\) &#60;img&#62; B/);
  assert.match(result.table, /\.\/study\/alice\/two-sum\/submissions\/9\/Solution.java/);
  assert.deepEqual(result.files, []); assert.deepEqual(result.warnings, []);
});

test('API failures retain solution links with Unknown and can be retried without storing a false difficulty', async t => {
  const f = await fixture(t); await f.add();
  const failed = await buildStudyIndex({ root: f.root, getProblem: async () => { throw new Error('offline'); } });
  assert.match(failed.table, /Difficulty-Unknown-lightgrey/);
  assert.match(failed.table, /alice.*Solution.java/);
  assert.deepEqual(failed.warnings, ['two-sum']); assert.deepEqual(failed.files, []);
  const recovered = await buildStudyIndex({ root: f.root, getProblem: async slug => ({ slug, title: 'Two Sum', difficulty: 'Easy' }) });
  assert.match(recovered.table, /Difficulty-Easy-brightgreen/);
  assert.equal(recovered.files.length, 1);
});

test('changed source, mismatched metadata paths and symlinks cannot become solution links', async t => {
  const f = await fixture(t); await f.add({ hash: 'wrong' });
  const build = () => buildStudyIndex({ root: f.root, getProblem: () => { throw new Error('must not reach API'); } });
  await assert.rejects(build(), /원문 정보/);
  await f.add();
  const path = 'study/two-sum/alice/submissions/9/Solution.java';
  await rm(join(f.root, path)); await f.write('outside.java', 'class Solution {}');
  await symlink(join(f.root, 'outside.java'), join(f.root, path));
  await assert.rejects(build(), /파일 형식/);
  await rm(join(f.root, path)); await f.add();
  await f.write('study/two-sum/alice/submissions/9/submission.json', JSON.stringify({ version: 1, slug: 'other', member: 'alice', submissionId: '9', language: 'java', status: 'Accepted', capturedAt: 1, sourceSha256: sourceHash('\r\nclass Solution { // 한글 원문  \r\n}\r\n') }));
  await assert.rejects(build(), /경로와 원문/);
});

test('only the marked README table changes, and an empty repository has no fictional solutions', async t => {
  const f = await fixture(t);
  const result = await buildStudyIndex({ root: f.root, getProblem: () => { throw new Error('must not fetch'); } });
  assert.match(result.table, /아직 병합된 풀이가 없습니다/);
  const before = '# Study\n\n<!-- study-index:start -->\nold\n<!-- study-index:end -->\n\nKeep setup instructions.\n';
  const after = replaceStudyIndex(before, result.table);
  assert.ok(after.startsWith('# Study\n\n<!-- study-index:start -->\n\n'));
  assert.ok(after.endsWith('<!-- study-index:end -->\n\nKeep setup instructions.\n'));
  assert.equal(replaceStudyIndex(after, result.table), after);
  assert.throws(() => replaceStudyIndex('no markers', result.table), /시작과 끝/);
  assert.throws(() => replaceStudyIndex(before + '<!-- study-index:start -->', result.table), /시작과 끝/);
});
