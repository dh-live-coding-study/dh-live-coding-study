(() => {
  const channel = 'dh-leetcode-submission-v1';
  async function configure() {
    try {
      const settings = await chrome.runtime.sendMessage({ type: 'settings' });
      window.postMessage({ channel, type: 'configure', enabled: settings?.enabled === true }, location.origin);
    } catch { /* 확장이 갱신되면 페이지를 새로 고친다. */ }
  }
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== 'https://leetcode.com' || event.data?.channel !== channel) return;
    if (event.data.type === 'loaded') { configure(); return; }
    if (['pending', 'verdict', 'error'].includes(event.data.type)) chrome.runtime.sendMessage(event.data).catch(() => {});
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message.type !== 'recheck') return;
    window.postMessage({ channel, type: 'recheck', submissionId: message.submissionId, leetcode: message.leetcode }, location.origin);
    respond({ started: true });
  });
  configure();
})();
