import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const privatePath = /^(?:\.local\/|\.env(?:\.|$)|skills\/java-live-coding-coach\/references\/)/;
const privateLink = /https?:\/\/(?:[a-z0-9-]+\.)*notion\.(?:com|so|site)(?=[/:?#\s]|$)/i;
let failed = false;
for (const file of files) {
  if (file !== '.env.example' && privatePath.test(file)) {
    process.stderr.write(`공개 대상이 아닌 경로: ${file}\n`);
    failed = true;
    continue;
  }
  let content;
  try { content = await readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  if (privateLink.test(content)) {
    process.stderr.write(`개인 문서 링크를 제거하세요: ${file}\n`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
else process.stdout.write('공개 파일의 제한 경로와 문서 링크 검사 통과\n');
