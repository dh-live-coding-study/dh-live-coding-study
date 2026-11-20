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

export function baseUrl(value) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('API 주소에는 HTTPS 또는 로컬 HTTP 주소를 사용하세요.');
  }
  return url.href.replace(/\/$/, '');
}

export async function requestJson(url, options = {}) {
  const { timeoutMs = 45000, fetchImpl = fetch, ...request } = options;
  let response;
  try {
    response = await fetchImpl(url, { ...request, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (['TimeoutError', 'AbortError'].includes(error.name)) throw Object.assign(new Error('API 응답 제한 시간을 초과했습니다.'), { kind: 'timeout' });
    throw Object.assign(new Error('API에 연결하지 못했습니다.'), { kind: 'network' });
  }
  if (!response.ok) {
    throw Object.assign(new Error(`API 요청 실패: HTTP ${response.status}`), { kind: 'http', status: response.status });
  }
  try { return await response.json(); }
  catch { throw Object.assign(new Error('API가 올바른 JSON을 반환하지 않았습니다.'), { kind: 'invalid_response' }); }
}

export async function fetchProblem(config, slug, options = {}) {
  identifier(slug, '문제 slug');
  const data = await requestJson(`${baseUrl(config.apiBaseUrl)}/select?titleSlug=${encodeURIComponent(slug)}`, options);
  if (!data || data.titleSlug !== slug || typeof data.questionTitle !== 'string' ||
      typeof data.question !== 'string' || !data.question.trim()) {
    throw new Error('문제 본문을 가져오지 못했습니다. slug나 공개 여부를 확인하세요.');
  }
  return {
    slug, title: data.questionTitle, difficulty: data.difficulty,
    url: `https://leetcode.com/problems/${slug}/`,
    statement: data.question,
    examples: typeof data.exampleTestcases === 'string' ? data.exampleTestcases : '',
  };
}
