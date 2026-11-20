import { readdir, readFile, lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { submissionPaths, validateSubmission } from '../extension/submission.mjs';
import { sourceHash } from './import-submission.mjs';

const start = '<!-- study-index:start -->';
const end = '<!-- study-index:end -->';
const colors = { Easy: 'brightgreen', Medium: 'orange', Hard: 'red', Unknown: 'lightgrey' };
const escape = text => text.replace(/[\r\n]+/g, ' ').replace(/[&<>[\]\\|`*_]/g, char => `&#${char.charCodeAt(0)};`);

async function readRegularFile(root, path, limit = 100000) {
  if (!(await lstat(dirname(join(root, path)))).isDirectory()) throw new Error('학습 파일의 실제 폴더를 확인하세요.');
  const info = await lstat(join(root, path));
  if (!info.isFile() || info.size > limit) throw new Error('학습 목록에 사용할 파일 형식을 확인하세요.');
  return readFile(join(root, path), 'utf8');
}

async function submissionFiles(root, directory = 'study') {
  let entries;
  try {
    if (!(await lstat(join(root, directory))).isDirectory()) throw new Error('학습 목록의 실제 폴더를 확인하세요.');
    entries = await readdir(join(root, directory), { withFileTypes: true });
  }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = [];
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await submissionFiles(root, path));
    else if (entry.isFile() && entry.name === 'submission.json') files.push(path);
  }
  return files.sort();
}

function problemInfo(value, slug) {
  if (value?.slug !== slug || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200 ||
      !['Easy', 'Medium', 'Hard'].includes(value.difficulty)) throw new Error('문제 제목과 난이도를 확인하세요.');
  return { slug, title: value.title.trim(), difficulty: value.difficulty };
}

export async function buildStudyIndex({ root, getProblem }) {
  const groups = new Map();
  for (const path of await submissionFiles(root)) {
    const metadata = JSON.parse(await readRegularFile(root, path));
    if (metadata.status !== 'Accepted') continue;
    const codePath = path.replace(/submission\.json$/, 'Solution.java');
    const code = await readRegularFile(root, codePath, 40000);
    const item = validateSubmission({ ...metadata, code, timestamp: metadata.capturedAt });
    if (metadata.version !== 1 || metadata.sourceSha256 !== sourceHash(code) ||
        ![false, true].some(legacy => submissionPaths(metadata.member, item, { legacy }).metadata === path)) {
      throw new Error('학습 목록의 제출 경로와 원문 정보를 확인하세요.');
    }
    if (!groups.has(item.slug)) groups.set(item.slug, new Map());
    const members = groups.get(item.slug);
    const previous = members.get(metadata.member);
    if (!previous || BigInt(item.submissionId) > BigInt(previous.submissionId)) {
      members.set(metadata.member, { submissionId: item.submissionId, codePath });
    }
  }
  const files = [], warnings = [], rows = [];
  for (const [slug, members] of [...groups].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const path = `study/${slug}/problem.json`;
    let problem;
    try { problem = problemInfo(JSON.parse(await readRegularFile(root, path)), slug); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try {
        problem = problemInfo(await getProblem(slug), slug);
        files.push({ path, content: JSON.stringify(problem, null, 2) + '\n' });
      } catch {
        problem = { title: slug, difficulty: 'Unknown' };
        warnings.push(slug);
      }
    }
    const badge = `![Difficulty: ${problem.difficulty}](https://img.shields.io/badge/Difficulty-${problem.difficulty}-${colors[problem.difficulty]})`;
    const solutions = [...members].sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([member, item]) => `[${escape(member)}](./${item.codePath})`).join(', ');
    rows.push(`| [${escape(problem.title)}](https://leetcode.com/problems/${slug}/) | ${badge} | ${solutions} |`);
  }
  const table = ['| 문제 | 난이도 | 풀이 |', '| --- | --- | --- |', ...rows].join('\n');
  return { table: rows.length ? table : table + '\n\n아직 병합된 풀이가 없습니다.', files, warnings };
}

export function replaceStudyIndex(readme, table) {
  if (readme.split(start).length !== 2 || readme.split(end).length !== 2 || readme.indexOf(start) > readme.indexOf(end)) {
    throw new Error('README의 학습 목록 시작과 끝 표시를 확인하세요.');
  }
  return readme.slice(0, readme.indexOf(start) + start.length) + '\n\n' + table + '\n\n' + readme.slice(readme.indexOf(end));
}
