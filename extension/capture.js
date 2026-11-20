(() => {
  const channel = 'dh-leetcode-submission-v1';
  const originalFetch = window.fetch.bind(window);
  let enabled = false;
  const seen = new Set();
  const checking = new Set();
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== channel) return;
    if (event.data.type === 'configure') enabled = event.data.enabled === true;
    if (enabled && event.data.type === 'recheck') recheck(event.data.submissionId, event.data.leetcode);
  });
  const emit = (type, data) => window.postMessage({ channel, type, ...data }, location.origin);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  function submitted(url, method, body) {
    if (!enabled || method.toUpperCase() !== 'POST') return null;
    const parsed = new URL(url, location.href);
    const slug = parsed.origin === location.origin && parsed.pathname.match(/^\/problems\/([a-z0-9-]+)\/submit\/$/)?.[1];
    if (!slug || typeof body !== 'string') return null;
    try {
      const payload = JSON.parse(body);
      if (payload.lang !== 'java' || typeof payload.typed_code !== 'string') return null;
      return { slug, language: 'java', code: payload.typed_code, timestamp: Math.floor(Date.now() / 1000) };
    } catch { return null; }
  }
  async function account() {
    const response = await originalFetch('/graphql/', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query { userStatus { username } }' }) });
    const username = (await response.json())?.data?.userStatus?.username;
    if (!username) throw new Error('account');
    return username;
  }
  async function poll(submissionId, leetcode) {
    if (checking.has(submissionId)) return;
    checking.add(submissionId);
    try {
      for (let attempt = 0; attempt < 45; attempt++) {
        await pause(2000);
        try {
          const response = await originalFetch(`/submissions/detail/${submissionId}/check/`, { credentials: 'same-origin' });
          if (!response.ok) continue;
          const status = await response.json();
          if (status.state === 'SUCCESS' && typeof status.status_msg === 'string') {
            emit('verdict', { submissionId, leetcode, status: status.status_msg });
            return;
          }
        } catch { /* 판정 조회 실패 시 원문은 로컬에 남겨 재확인한다. */ }
      }
      emit('verdict', { submissionId, leetcode, status: 'Pending' });
    } finally { checking.delete(submissionId); }
  }
  async function recheck(submissionId, leetcode) {
    if (!/^[1-9][0-9]{0,15}$/.test(submissionId) || typeof leetcode !== 'string') return;
    try {
      if ((await account()).toLowerCase() !== leetcode.toLowerCase()) throw new Error('account');
      await poll(submissionId, leetcode);
    } catch { emit('error', {}); }
  }
  async function collect(item, result) {
    const submissionId = String(result?.submission_id || '');
    if (!item || !/^[1-9][0-9]{0,15}$/.test(submissionId) || seen.has(submissionId)) return;
    seen.add(submissionId);
    try {
      const leetcode = await account();
      emit('pending', { submission: { ...item, submissionId, leetcode, status: 'Pending' } });
      await poll(submissionId, leetcode);
    } catch { emit('error', {}); }
  }
  window.fetch = async function(input, init) {
    let item = null;
    try {
      const request = input instanceof Request ? input : null;
      const body = init?.body ?? (request ? await request.clone().text() : undefined);
      item = submitted(request?.url || input, init?.method || request?.method || 'GET', body);
    } catch { /* 수집 실패로 실제 제출을 방해하지 않는다. */ }
    const response = await originalFetch(input, init);
    if (item && response.ok) response.clone().json().then(data => collect(item, data)).catch(() => {});
    return response;
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const requests = new WeakMap();
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    const previous = requests.get(this);
    if (previous?.listener) this.removeEventListener('load', previous.listener);
    requests.set(this, { method, url });
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function(body) {
    let item;
    try { const request = requests.get(this); item = request && submitted(request.url, request.method, body); } catch { /* 실제 제출은 계속한다. */ }
    if (item) {
      const listener = () => {
        if (this.status < 200 || this.status >= 300) return;
        try { collect(item, this.responseType === 'json' ? this.response : JSON.parse(this.responseText)); } catch { /* 제출 ID가 없으면 수집하지 않는다. */ }
      };
      requests.get(this).listener = listener;
      this.addEventListener('load', listener, { once: true });
    }
    return originalSend.call(this, body);
  };
  emit('loaded', {});
})();
