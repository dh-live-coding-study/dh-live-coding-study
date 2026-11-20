import { validateSettings } from './delivery.mjs';
await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
const form = document.querySelector('form');
const status = document.querySelector('#status');
const { settings } = await chrome.storage.local.get('settings');
if (settings) for (const [key, value] of Object.entries(settings)) {
  const field = form.elements.namedItem(key);
  if (field) { if (field.type === 'checkbox') field.checked = value; else field.value = value; }
}
async function refresh() {
  const response = await chrome.runtime.sendMessage({ type: 'queue' });
  status.textContent = response.error || response.lastError || '';
  document.querySelector('#queue').replaceChildren();
  const { settings } = await chrome.storage.local.get('settings');
  if (/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(settings?.repository || '')) document.querySelector('#runs').href = `https://github.com/${settings.repository}/actions/workflows/import-submission.yml`;
  for (const item of response.queue || []) {
    const row = document.createElement('li');
    const text = document.createElement('div');
    text.textContent = `${item.slug} #${item.submissionId}: ${item.message || '판정 대기 중입니다.'}`;
    row.append(text);
    for (const [label, type] of (item.status === 'Accepted' ? [['PR 확인', 'confirm'], ['다시 전송', 'retry'], ['로컬 기록 삭제', 'clear']] : [['판정 재확인', 'retry'], ['로컬 기록 삭제', 'clear']])) {
      const button = document.createElement('button'); button.textContent = label;
      button.addEventListener('click', async () => { button.disabled = true; await chrome.runtime.sendMessage({ type, id: item.submissionId }); await refresh(); });
      row.append(button);
    }
    document.querySelector('#queue').append(row);
  }
  document.querySelector('#history').replaceChildren();
  for (const item of [...(response.history || [])].reverse()) {
    const row = document.createElement('li');
    const link = document.createElement('a');
    link.textContent = `${item.slug} #${item.submissionId}`;
    link.href = item.url; link.target = '_blank'; link.rel = 'noreferrer';
    row.append(link); document.querySelector('#history').append(row);
  }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const settings = Object.fromEntries(new FormData(form));
  settings.enabled = form.elements.namedItem('enabled').checked;
  try {
    validateSettings({ ...settings, enabled: true });
    await chrome.storage.local.set({ settings, lastError: '' });
    await refresh(); status.textContent = '저장했습니다. LeetCode 탭을 새로 고치세요.';
  } catch (error) { status.textContent = error.message; }
});
document.querySelector('#refresh').addEventListener('click', refresh);
await refresh();
