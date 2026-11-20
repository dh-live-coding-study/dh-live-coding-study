import { validateSubmission, submissionPaths } from './submission.mjs';

export function validateSettings(settings) {
  if (!settings?.enabled || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(settings.repository || '') || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(settings.member || '') || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(settings.leetcode || '') || !settings.token) throw new Error('저장소, 멤버 ID, LeetCode 계정, GitHub 토큰을 설정하고 수집을 켜세요.');
  return settings;
}

export async function dispatchSubmission(settings, input, fetchImpl = fetch) {
  validateSettings(settings);
  const item = validateSubmission(input);
  if (item.status !== 'Accepted') throw new Error('정답 판정이 확인된 제출만 전송합니다.');
  if (input.leetcode?.toLowerCase() !== settings.leetcode.toLowerCase()) throw new Error('현재 로그인한 LeetCode 계정이 설정과 다릅니다.');
  const body = JSON.stringify({ ref: 'main', inputs: { member: settings.member, submission: JSON.stringify({ ...item, leetcode: input.leetcode }) } });
  if (new TextEncoder().encode(body).length > 60000) throw new Error('GitHub 실행 입력 크기를 초과했습니다. 코드 파일을 작업 브랜치의 PR로 직접 등록하세요.');
  await githubRequest(settings, '/actions/workflows/import-submission.yml/dispatches', { method: 'POST', body }, fetchImpl);
  return { state: 'dispatched', message: '실행 요청을 접수했습니다. PR 생성 성공 여부는 GitHub Actions에서 확인하세요.' };
}

async function githubRequest(settings, path, options, fetchImpl) {
  const { optional = false, ...requestOptions } = options;
  let response;
  try {
    response = await fetchImpl(`https://api.github.com/repos/${settings.repository}${path}`, {
      ...requestOptions, headers: { Authorization: `Bearer ${settings.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000),
    });
  } catch { throw new Error('GitHub 응답을 확인하지 못했습니다. 원문을 보존했으니 실행 기록을 확인한 뒤 재시도하세요.'); }
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub 요청 실패: HTTP ${response.status}. 토큰 권한과 API 한도를 확인하세요.`);
  if (response.status === 204) return null;
  try { return await response.json(); } catch { throw new Error('GitHub 응답 형식을 확인하지 못했습니다.'); }
}

export async function confirmSubmission(settings, input, fetchImpl = fetch) {
  validateSettings(settings);
  const item = validateSubmission(input);
  if (item.status !== 'Accepted' || input.leetcode?.toLowerCase() !== settings.leetcode.toLowerCase()) throw new Error('확인할 정답 제출과 계정이 일치하지 않습니다.');
  const paths = submissionPaths(settings.member, item);
  const owner = settings.repository.split('/')[0];
  const pulls = await githubRequest(settings, `/pulls?state=all&head=${encodeURIComponent(owner + ':' + paths.branch)}&base=main&per_page=10`, {}, fetchImpl);
  if (!Array.isArray(pulls)) throw new Error('PR 목록을 확인하지 못했습니다.');
  const pr = pulls.find(pr => pr.head?.ref === paths.branch && pr.base?.ref === 'main' && pr.head?.repo?.full_name?.toLowerCase() === settings.repository.toLowerCase());
  if (!pr) return null;
  if (!Number.isSafeInteger(pr.number) || pr.number < 1 || !/^[a-f0-9]{40}$/i.test(pr.head.sha)) throw new Error('PR 정보를 확인하지 못했습니다.');
  let file;
  for (const legacy of [false, true]) {
    const candidate = submissionPaths(settings.member, item, { legacy });
    file = await githubRequest(settings, `/contents/${candidate.code.split('/').map(encodeURIComponent).join('/')}?ref=${pr.head.sha}`, { optional: true }, fetchImpl);
    if (file) break;
  }
  if (file?.type !== 'file' || file.encoding !== 'base64' || file.size > 40000 || typeof file.content !== 'string') throw new Error('PR의 Java 파일 형식을 확인하지 못했습니다.');
  let bytes;
  try { bytes = Uint8Array.from(atob(file.content), ch => ch.charCodeAt(0)); }
  catch { throw new Error('PR의 Java 원문을 읽지 못했습니다.'); }
  const expected = new TextEncoder().encode(item.code);
  if (bytes.length !== expected.length || bytes.some((value, index) => value !== expected[index])) throw new Error('PR의 코드가 수집한 원문과 다릅니다. 로컬 원문을 유지합니다.');
  return `https://github.com/${settings.repository}/pull/${pr.number}`;
}
