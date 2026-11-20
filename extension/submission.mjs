export function validateSubmission(input) {
  const required = ['submissionId', 'slug', 'language', 'code', 'status', 'timestamp'];
  if (!input || required.some(key => input[key] === undefined)) throw new Error('제출 정보가 부족합니다.');
  const submissionId = String(input.submissionId);
  if (!/^[1-9][0-9]{0,15}$/.test(submissionId)) throw new Error('제출 ID를 확인하세요.');
  if (typeof input.slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(input.slug)) throw new Error('문제 slug를 확인하세요.');
  if (typeof input.language !== 'string' || input.language.toLowerCase() !== 'java') throw new Error('현재 수집기는 Java 제출만 지원합니다.');
  if (typeof input.code !== 'string' || !input.code.trim() || new TextEncoder().encode(input.code).length > 40000) throw new Error('코드는 비어 있지 않은 40KB 이하의 Java 소스여야 합니다.');
  if (/https?:\/\/(?:[a-z0-9-]+\.)*notion\.(?:com|so|site)(?=[/:?#\s]|$)/i.test(input.code)) throw new Error('개인 문서 링크가 포함된 코드는 전송하지 않습니다.');
  if (typeof input.status !== 'string' || !input.status.trim() || input.status.length > 80 || /[\r\n]/.test(input.status)) throw new Error('제출 결과를 확인하세요.');
  const timestamp = Number(input.timestamp);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > 8640000000000) throw new Error('제출 시각을 확인하세요.');
  // trim이나 줄바꿈 변환 없이 LeetCode에서 받은 코드 문자열을 보존한다.
  return { submissionId, slug: input.slug, language: 'java', code: input.code, status: input.status, timestamp };
}

export function submissionPaths(member, item, { legacy = false } = {}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(member)) throw new Error('멤버 ID를 확인하세요.');
  const group = legacy ? `${member}/${item.slug}` : `${item.slug}/${member}`;
  const root = `study/${group}/submissions/${item.submissionId}`;
  return { root, code: `${root}/Solution.java`, metadata: `${root}/submission.json`, branch: `leetcode/${member}/${item.slug}/${item.submissionId}` };
}
