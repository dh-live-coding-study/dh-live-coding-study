import { createHash } from 'node:crypto';
import { buildInstructions } from './interview.mjs';
import { sourceHash } from './import-submission.mjs';
import { submissionPaths, validateSubmission } from '../extension/submission.mjs';
import { tokenUsage } from './llm.mjs';

const bot = user => user?.login === 'github-actions[bot]' && user?.id === 41898282;
const marker = /^<!-- dh-interview:v1:([A-Za-z0-9+/=]+) -->\n/;
const encode = (state, text) => `<!-- dh-interview:v1:${Buffer.from(JSON.stringify(state)).toString('base64')} -->\n${text}`;
const finishText = '면접을 마칩니다. 실제 대화에서 드러난 문제 해결 과정, 의사소통, 구어체 영어 표현 중 필요한 내용과 다음 연습할 점을 한국어로 간결하게 피드백해 주세요.';

function parseInput(input) {
  const commands = [], lines = [];
  for (const line of input.body.split('\n')) {
    const text = line.trim();
    if (/^\/(interview|retry|hint|finish)$/.test(text)) commands.push(text.slice(1));
    else if (/^@github-actions(?:\[bot\])?(?:\s+\/interview)?$/i.test(text)) commands.push('interview');
    else lines.push(line);
  }
  return { ...input, commands, text: lines.join('\n') };
}

function usageText(value) {
  const usage = tokenUsage(value);
  if (!usage) return '토큰 사용량: 확인 불가.';
  const count = value => value.toLocaleString('en-US');
  const detail = [];
  if (usage.prompt_tokens_details?.cached_tokens) detail.push(`입력 중 캐시 ${count(usage.prompt_tokens_details.cached_tokens)}`);
  if (usage.completion_tokens_details?.reasoning_tokens) detail.push(`출력 중 추론 ${count(usage.completion_tokens_details.reasoning_tokens)}`);
  return `토큰 사용량: 입력 ${count(usage.prompt_tokens)}, 출력 ${count(usage.completion_tokens)}, 합계 ${count(usage.total_tokens)}` + (detail.length ? ` (${detail.join(', ')})` : '') + '.';
}

function failureReason(error) {
  if (error?.kind === 'http' && Number.isInteger(error.status) && error.status >= 100 && error.status <= 599) return `LLM API HTTP ${error.status}`;
  const reasons = { configuration: 'LLM 키, 모델 또는 API 주소 설정 오류', timeout: 'LLM API 응답 시간 초과', network: 'LLM API 연결 실패', invalid_response: 'LLM 응답 형식 오류', incomplete: 'LLM 응답 미완성, 출력 한도와 모델 설정 확인 필요' };
  return Object.hasOwn(reasons, error?.kind) ? reasons[error.kind] : '면접 응답 처리 실패, PR 상태와 설정 확인 필요';
}

export function interviewLimits(config) {
  const settings = config.interview || {};
  const limits = { mode: settings.mode || 'mock', maxAttempts: settings.maxAttempts ?? 12, maxReplies: settings.maxReplies ?? 10,
    maxInputCharacters: settings.maxInputCharacters ?? 48000, maxOutputTokens: settings.maxOutputTokens ?? 1600 };
  if (!['mock', 'coach'].includes(limits.mode) || !Number.isInteger(limits.maxAttempts) || limits.maxAttempts < 1 || limits.maxAttempts > 30 ||
      !Number.isInteger(limits.maxReplies) || limits.maxReplies < 1 || limits.maxReplies > 30 ||
      !Number.isInteger(limits.maxInputCharacters) || limits.maxInputCharacters < 1000 || limits.maxInputCharacters > 100000 ||
      !Number.isInteger(limits.maxOutputTokens) || limits.maxOutputTokens < 100 || limits.maxOutputTokens > 4000) throw new Error('interview 설정 범위를 확인하세요.');
  return limits;
}

function identityForPr(pr, config, repository) {
  if (!pr || pr.state !== 'open' || pr.base.ref !== 'main' || pr.head.repo?.full_name !== repository || !bot(pr.user)) return null;
  const match = /^leetcode\/([a-zA-Z0-9_-]+)\/([a-z0-9-]+)\/([1-9][0-9]{0,15})$/.exec(pr.head.ref);
  if (!match) return null;
  const [, memberId, slug, submissionId] = match;
  const member = config.members.find(item => item.id === memberId);
  return member?.github ? { memberId, slug, submissionId, member } : null;
}

async function authorizedActor({ github, member, actor, triggerCommentId, number, comments }) {
  if (triggerCommentId) {
    if (actor?.toLowerCase() !== member.github.toLowerCase()) return false;
    const trigger = (comments || await github.list(`/issues/${number}/comments`)).find(item => item.id === triggerCommentId);
    return trigger?.user?.login?.toLowerCase() === member.github.toLowerCase();
  }
  if (actor?.toLowerCase() === member.github.toLowerCase()) return true;
  if (!/^[a-z0-9-]+$/i.test(actor || '')) return false;
  const permission = await github.request(`/collaborators/${encodeURIComponent(actor)}/permission`);
  return permission.permission === 'admin';
}

// 비밀값과 PR별 동시 실행 대기열에 들어가기 전에 호출자를 확인한다.
export async function authorizePrInterview({ github, config, repository, number, actor, triggerCommentId }) {
  if (!Number.isSafeInteger(number) || number < 1) return false;
  const pr = await github.request(`/pulls/${number}`, { optional: true });
  const identity = identityForPr(pr, config, repository);
  return identity ? authorizedActor({ github, member: identity.member, actor, triggerCommentId, number }) : false;
}

async function materialForPr(github, config, repository, number) {
  const pr = await github.request(`/pulls/${number}`);
  const identity = identityForPr(pr, config, repository);
  if (!identity) throw new Error('자동 수집기가 만든 열린 학습 PR만 지원합니다.');
  const { memberId, slug, submissionId, member } = identity;
  const files = await github.list(`/pulls/${number}/files`);
  const paths = [false, true].map(legacy => submissionPaths(memberId, { slug, submissionId }, { legacy }))
    .find(paths => files.length === 2 && files.every(file => [paths.code, paths.metadata].includes(file.filename) && file.status === 'added'));
  if (!paths) throw new Error('제출 PR에는 새 Java 소스와 메타데이터만 포함해야 합니다.');
  const code = await github.readText(paths.code, pr.head.sha);
  let metadata;
  try { metadata = JSON.parse(await github.readText(paths.metadata, pr.head.sha)); } catch { throw new Error('제출 메타데이터 형식을 확인하세요.'); }
  if (!metadata || metadata.version !== 1 || metadata.status !== 'Accepted' || metadata.member !== memberId || metadata.leetcode !== member.leetcode || metadata.github !== member.github || metadata.submissionId !== submissionId || metadata.slug !== slug || metadata.sourceSha256 !== sourceHash(code || '')) throw new Error('정답 제출 정보와 소스 해시가 일치하지 않습니다.');
  validateSubmission({ ...metadata, code, timestamp: metadata.capturedAt });
  return { pr, member, code, metadata };
}

function recordsFrom(comments, head) {
  return comments.filter(comment => bot(comment.user) && marker.test(comment.body || '')).map(comment => {
    const match = marker.exec(comment.body);
    let state;
    try { state = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')); } catch { throw new Error('면접 상태 댓글이 손상됐습니다.'); }
    if (state.head !== head || !['pending', 'done', 'failed', 'rejected'].includes(state.status) || !Array.isArray(state.inputs) || !state.inputs.every(item => Number.isSafeInteger(item.id) && typeof item.body === 'string')) throw new Error('제출 코드 또는 면접 상태가 바뀌었습니다. 새 제출 PR로 연습하세요.');
    if (state.session !== undefined && (!Number.isSafeInteger(state.session) || state.session < 1)) throw new Error('면접 회차 정보를 확인하세요.');
    const text = comment.body.slice(match[0].length);
    if (state.responseCharacters !== undefined && (!Number.isSafeInteger(state.responseCharacters) || state.responseCharacters < 0 || state.responseCharacters > text.length)) throw new Error('면접 응답 길이 정보를 확인하세요.');
    return { comment, state, text: state.responseCharacters === undefined ? text : text.slice(0, state.responseCharacters) };
  });
}

export async function runPrInterview({ github, config, repository, number, actor, triggerCommentId, root, getProblem, client }) {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('PR 번호를 확인하세요.');
  const limits = interviewLimits(config);
  const { pr, member, code, metadata } = await materialForPr(github, config, repository, number);
  const comments = (await github.list(`/issues/${number}/comments`)).sort((a, b) => a.id - b.id);
  // 댓글 실행은 등록된 답변자만, 수동 복구는 저장소 관리자 또는 본인만 허용한다.
  if (!await authorizedActor({ github, member, actor, triggerCommentId, number, comments })) return { skipped: '다른 사용자의 실행' };
  const records = recordsFrom(comments, pr.head.sha);
  const allAttempts = records.filter(record => record.state.status !== 'rejected');
  const latest = allAttempts.at(-1);
  const consumed = new Set(records.flatMap(record => record.state.inputs.map(input => input.id)));
  const pending = comments.filter(comment => comment.user?.login?.toLowerCase() === member.github.toLowerCase() && !consumed.has(comment.id));
  if (latest && !pending.length) return { skipped: '새 답변 없음' };
  const newInputs = pending.map(comment => ({ id: comment.id, body: comment.body }));
  const parsed = newInputs.map(parseInput);
  const requested = parsed.some(input => input.commands.includes('interview'));
  let session = latest?.state.session ?? 1;
  let attempts = allAttempts.filter(record => (record.state.session ?? 1) === session);
  let replies = attempts.filter(record => record.state.status === 'done').length;
  const ended = latest?.state.finished || attempts.length >= limits.maxAttempts || replies >= limits.maxReplies;
  if (ended && !requested) return { skipped: '면접 종료 또는 요청 한도, /interview로 다시 시작하세요.' };
  if (ended) { session++; attempts = []; replies = 0; }
  if (latest?.state.status === 'done' && parsed.every(input => !input.text.trim() && input.commands.length && input.commands.every(command => command === 'retry'))) return { skipped: '재시도할 요청 없음' };
  if (latest && latest.state.status !== 'done' && !requested && !parsed.some(input => input.commands.includes('retry'))) return { skipped: '재시도 명령 대기' };
  let priorFailedInputs = latest && latest.state.status !== 'done' ? latest.state.inputs.filter(input => input.body.trim() !== '/retry') : [];
  // 새 회차에는 이전 답변만 넘기고 종료 등의 명령은 다시 적용하지 않는다.
  if (ended) priorFailedInputs = priorFailedInputs.map(parseInput).map(input => ({ id: input.id, body: input.text }));
  const inputs = [...priorFailedInputs, ...newInputs];
  const rejectInputs = async reason => {
    // 큰 본문을 상태 댓글에 다시 복사하지 않고 제외할 ID만 보관한다.
    const state = { head: pr.head.sha, session, status: 'rejected', finished: false, inputs: newInputs.map(item => ({ id: item.id, body: '' })) };
    await github.request(`/issues/${number}/comments`, { method: 'POST', body: { body: encode(state, reason + '\n\n이번 답변은 LLM에 보내지 않았습니다. 원본 댓글은 유지하며 다음 요청에서는 제외합니다. 새 댓글로 짧게 답하거나 `/finish`를 남겨 주세요. 실패한 요청이 대기 중이면 `/retry`를 사용하세요.') } });
    return { rejected: true };
  };
  if (inputs.map(parseInput).reduce((sum, item) => sum + item.text.length, 0) > 8000) return rejectInputs('한 차례의 답변 합계가 8,000자를 넘었습니다.');
  if (inputs.reduce((sum, item) => sum + item.body.length, 0) > 10000) return rejectInputs('답변과 명령을 포함한 댓글이 너무 깁니다.');
  const finishing = inputs.some(input => parseInput(input).commands.includes('finish')) || replies + 1 >= limits.maxReplies || attempts.length + 1 >= limits.maxAttempts;
  const { system, skillHash } = await buildInstructions(root, limits.mode);
  const problem = await getProblem(metadata.slug);
  const messages = [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify({ type: 'interview_material', problem, candidateCode: code, submissionStatus: metadata.status }) + '\n이 제출 코드를 함께 살펴보며 영어로 면접을 시작해 주세요. 먼저 풀이에 어떻게 접근했는지 짧게 물어봐 주세요.' }];
  const appendInputs = items => {
    const parsed = items.map(parseInput);
    const text = parsed.flatMap(input => [input.text.trim(), ...(input.commands.includes('hint') ? ['Can you give me a small hint?'] : []),
      ...(input.commands.includes('interview') ? ['Please continue the interview with a follow-up question.'] : [])]).filter(Boolean).join('\n\n');
    if (text) messages.push({ role: 'user', content: text });
  };
  for (const record of records.filter(item => item.state.status === 'done')) {
    appendInputs(record.state.inputs);
    messages.push({ role: 'assistant', content: record.text });
  }
  appendInputs(inputs);
  if (finishing) messages.push({ role: 'user', content: finishText });
  // 오래된 문답만 제외하고 코드, 최근 답변은 유지한다. 원본 댓글은 삭제하지 않는다.
  let shortened = false;
  while (messages.reduce((sum, item) => sum + item.content.length, 0) > limits.maxInputCharacters && messages.length > 4) {
    messages.splice(2, 1);
    shortened = true;
  }
  if (shortened) messages[0].content += '\n이전 대화 일부가 길이 제한으로 제외됐다. 제공된 대화에 한정해서 피드백하고 그 범위를 밝혀라.';
  if (messages.reduce((sum, item) => sum + item.content.length, 0) > limits.maxInputCharacters) return rejectInputs('문제 본문과 코드, 최근 답변이 면접 입력 한도를 초과했습니다. 답변 없이도 같은 오류가 나면 대표자가 입력 한도 설정을 확인해야 합니다.');
  const state = { head: pr.head.sha, skillHash, session, status: 'pending', finished: false, inputs,
    attempt: attempts.length + 1, requestHash: createHash('sha256').update(JSON.stringify(messages)).digest('hex') };
  const reservation = await github.request(`/issues/${number}/comments`, { method: 'POST', body: { body: encode(state, '면접 응답을 준비하고 있습니다. 실행이 중단됐다면 Actions 상태를 확인한 뒤 `/retry`를 남겨 주세요. 재시도에는 API 비용이 다시 발생할 수 있습니다.') } });
  let result;
  try {
    result = await client.complete(messages);
    if (typeof result.text !== 'string' || !result.text.trim() || result.text.length > 16000) throw new Error('LLM 응답 길이 또는 형식 오류');
    const current = await github.request(`/pulls/${number}`);
    if (current.head.sha !== pr.head.sha || current.state !== 'open') throw new Error('응답 중 PR 변경');
  } catch (error) {
    state.status = 'failed';
    state.usage = tokenUsage(result?.usage ?? error?.usage);
    const reason = failureReason(error);
    const retry = state.attempt >= limits.maxAttempts
      ? '이번 회차의 요청 한도에 도달했습니다. `/interview`로 새 회차를 시작할 수 있습니다.'
      : '`/retry`로 같은 요청을 다시 보낼 수 있습니다.';
    await github.request(`/issues/comments/${reservation.id}`, { method: 'PATCH', body: { body: encode(state, `면접 응답을 완료하지 못했습니다. ${reason}. 답변은 보존했습니다. 대표자는 Actions 설정과 제공자 상태를 확인해 주세요. ${retry} 다시 요청하면 비용이 발생할 수 있습니다.\n\n${usageText(state.usage)}`) } });
    return { failed: true, reason };
  }
  state.status = 'done'; state.finished = finishing;
  state.usage = tokenUsage(result.usage); state.responseCharacters = result.text.length;
  const footer = `\n\n---\n면접 ${session}, AI 답변 ${replies + 1}/${limits.maxReplies}\n\n${usageText(state.usage)}` +
    (finishing ? '\n\n다시 연습하려면 `/interview` 또는 `@github-actions[bot]`을 한 줄로 남겨 주세요.' : '');
  // 댓글 저장 실패 시 pending 상태를 남긴다. 자동으로 LLM을 다시 호출하지 않는다.
  await github.request(`/issues/comments/${reservation.id}`, { method: 'PATCH', body: { body: encode(state, result.text + footer) } });
  return { finished: finishing, attempt: state.attempt };
}
