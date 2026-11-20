import { readFile } from 'node:fs/promises';

export function identifier(value, label = '식별자') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value)) throw new Error(`${label}에는 영문, 숫자, 하이픈, 밑줄만 사용할 수 있습니다.`);
  return value;
}

export async function readConfig(root) {
  const config = JSON.parse(await readFile(`${root}/study.config.json`, 'utf8'));
  if (config.version !== 1 || !Array.isArray(config.members)) throw new Error('설정 파일의 version과 members를 확인하세요.');
  const seen = new Set();
  for (const member of config.members) {
    identifier(member.id, '멤버 ID');
    identifier(member.leetcode, 'LeetCode 아이디');
    if (typeof member.github !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(member.github)) throw new Error('참여자의 GitHub 로그인 이름을 등록하세요.');
    if (seen.has(member.id)) throw new Error('멤버 ID가 중복됐습니다.');
    seen.add(member.id);
  }
  return config;
}
