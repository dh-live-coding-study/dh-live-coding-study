import { validateSubmission } from './submission.mjs';
import { dispatchSubmission, confirmSubmission } from './delivery.mjs';

const alarmName = 'confirm-submission';
const pendingStatus = status => ['Pending', 'Submitted (result unavailable)'].includes(status);
const ready = (async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  if (!await chrome.alarms.get(alarmName)) await chrome.alarms.create(alarmName, { periodInMinutes: 1 });
})();
let serial = Promise.resolve();
const enqueue = task => (serial = serial.catch(() => {}).then(task));
const matches = (record, settings) => record.repository === settings.repository && record.member === settings.member && record.submission.leetcode?.toLowerCase() === settings.leetcode.toLowerCase();
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

async function state() {
  await ready;
  const data = await chrome.storage.local.get(['settings', 'queue', 'history', 'lastError']);
  // 이전 버전에서 남긴 오답도 전송하거나 이력에 보관하지 않는다.
  const queue = (data.queue || []).filter(item => item.submission.status === 'Accepted' || pendingStatus(item.submission.status));
  if (queue.length !== (data.queue || []).length) await chrome.storage.local.set({ queue });
  return { ...data, queue, history: data.history || [] };
}

async function confirm(record, data) {
  if (!matches(record, data.settings)) throw new Error('수집 당시의 저장소와 멤버 설정으로 복원하세요.');
  try {
    const url = await confirmSubmission(data.settings, record.submission);
    if (url) {
      // 동일 원문이 PR에 있는 것을 확인한 뒤에만 원문을 지우고 작은 이력을 남긴다.
      data.queue = data.queue.filter(item => item !== record);
      data.history = [...data.history, { submissionId: record.submission.submissionId, slug: record.submission.slug, url }].slice(-30);
      await chrome.storage.local.set({ queue: data.queue, history: data.history, lastError: '' });
      return true;
    }
    record.message = '아직 PR을 확인하지 못했습니다. 원문을 보관하고 있습니다.';
  } catch (error) { record.message = error.message; }
  record.nextCheckAt = Date.now() + 5 * 60000;
  data.queue = [...data.queue.filter(item => item !== record), record];
  await chrome.storage.local.set({ queue: data.queue });
  return false;
}

async function handle(message, sender) {
  const options = sender.url === chrome.runtime.getURL('options.html');
  const leetcode = sender.tab && sender.frameId === 0 && new URL(sender.url || 'https://invalid.example').origin === 'https://leetcode.com';
  if (!options && !leetcode) throw new Error('허용하지 않는 요청입니다.');
  const data = await state();
  const { settings, queue } = data;
  if (message.type === 'settings') return { enabled: settings?.enabled === true };
  if (options && message.type === 'queue') {
    await chrome.action.setBadgeText({ text: '' });
    return { queue: queue.map(({ submission, ...item }) => ({ ...item, submissionId: submission.submissionId, slug: submission.slug, status: submission.status })), history: data.history, lastError: data.lastError || '' };
  }
  if (options && message.type === 'clear') { await chrome.storage.local.set({ queue: queue.filter(item => item.submission.submissionId !== message.id) }); return {}; }
  if (!settings?.enabled) throw new Error('수집이 꺼져 있습니다.');
  if (leetcode && message.type === 'error') throw new Error('LeetCode 계정 또는 판정을 확인하지 못했습니다. 로그인 상태를 확인하세요.');
  let record;
  if (options && ['retry', 'confirm'].includes(message.type)) {
    record = queue.find(item => item.submission.submissionId === message.id);
    if (!record) throw new Error('대기 중인 제출이 없습니다.');
    if (!matches(record, settings)) throw new Error('수집 당시의 저장소와 멤버 설정으로 복원하세요.');
    if (pendingStatus(record.submission.status)) {
      const tabs = await chrome.tabs.query({ url: 'https://leetcode.com/*' });
      if (!tabs.length) throw new Error('로그인한 LeetCode 탭을 열고 새로 고친 뒤 다시 확인하세요.');
      try { await chrome.tabs.sendMessage(tabs[0].id, { type: 'recheck', submissionId: record.submission.submissionId, leetcode: record.submission.leetcode }, { frameId: 0 }); }
      catch { throw new Error('LeetCode 탭을 새로 고친 뒤 다시 확인하세요.'); }
      record.message = 'LeetCode에서 판정을 다시 확인하고 있습니다.';
      await chrome.storage.local.set({ queue });
      return {};
    }
    if (await confirm(record, data) || message.type === 'confirm') return {};
  } else if (leetcode && message.type === 'pending') {
    const submission = { ...validateSubmission(message.submission), leetcode: message.submission.leetcode };
    if (!pendingStatus(submission.status)) throw new Error('판정 대기 중인 제출만 임시 저장합니다.');
    if (submission.leetcode?.toLowerCase() !== settings.leetcode.toLowerCase()) throw new Error('로그인한 LeetCode 계정과 설정이 다릅니다.');
    record = queue.find(item => item.submission.submissionId === submission.submissionId);
    if (record) {
      if (record.submission.code !== submission.code || record.submission.slug !== submission.slug) throw new Error('같은 제출 ID의 코드가 다릅니다.');
      return {};
    }
    queue.push({ submission, state: 'pending', repository: settings.repository, member: settings.member, message: '정답 판정을 기다립니다.' });
    // 완료 이력 개수로 새 원문 저장을 막지 않는다. 미확인 원문은 자동 삭제하지 않는다.
    await chrome.storage.local.set({ queue });
    return {};
  } else if (leetcode && message.type === 'verdict') {
    record = queue.find(item => item.submission.submissionId === message.submissionId);
    if (!record) return {};
    if (!matches(record, settings) || message.leetcode?.toLowerCase() !== record.submission.leetcode.toLowerCase()) throw new Error('판정을 조회한 계정이 다릅니다.');
    if (typeof message.status !== 'string' || !message.status.trim() || message.status.length > 80) throw new Error('제출 판정 형식을 확인하세요.');
    if (pendingStatus(message.status)) return {};
    if (message.status !== 'Accepted') {
      await chrome.storage.local.set({ queue: queue.filter(item => item !== record) });
      return {};
    }
    if (record.submission.status === 'Accepted') return {};
    record.submission.status = 'Accepted';
    await chrome.storage.local.set({ queue });
  } else throw new Error('허용하지 않는 요청입니다.');
  try { Object.assign(record, await dispatchSubmission(settings, record.submission)); }
  catch (error) { record.state = 'failed'; record.message = error.message; }
  record.nextCheckAt = Date.now() + 60000;
  await chrome.storage.local.set({ queue: data.queue });
  return {};
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  enqueue(() => handle(message, sender)).then(respond, async error => {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.storage.local.set({ lastError: error.message }).catch(() => {});
    respond({ error: error.message });
  });
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== alarmName) return;
  return enqueue(async () => {
    const data = await state();
    if (!data.settings?.enabled) return;
    const record = data.queue.find(item => item.submission.status === 'Accepted' && matches(item, data.settings) && (item.nextCheckAt || 0) <= Date.now());
    // 한 번에 한 건만 확인해 새 제출 저장을 긴 API 조회 뒤에 대기시키지 않는다.
    if (record) await confirm(record, data);
  });
});
