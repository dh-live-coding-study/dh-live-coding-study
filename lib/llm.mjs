import { baseUrl, requestJson } from './core.mjs';

export function tokenUsage(value) {
  const valid = count => Number.isSafeInteger(count) && count >= 0;
  if (!value || !['prompt_tokens', 'completion_tokens', 'total_tokens'].every(key => valid(value[key])) ||
      value.total_tokens !== value.prompt_tokens + value.completion_tokens) return null;
  const usage = { prompt_tokens: value.prompt_tokens, completion_tokens: value.completion_tokens, total_tokens: value.total_tokens };
  const cached = value.prompt_tokens_details?.cached_tokens;
  const reasoning = value.completion_tokens_details?.reasoning_tokens;
  if (valid(cached) && cached <= usage.prompt_tokens) usage.prompt_tokens_details = { cached_tokens: cached };
  if (valid(reasoning) && reasoning <= usage.completion_tokens) usage.completion_tokens_details = { reasoning_tokens: reasoning };
  return usage;
}

export function providerSettings(config, env = process.env) {
  try {
    const settings = config.llm;
    if (settings?.protocol !== 'chat-completions') throw new Error('protocol');
    const model = env.LLM_MODEL || settings.model;
    const url = baseUrl(env.LLM_BASE_URL || settings.baseUrl);
    const apiKey = env.LLM_API_KEY;
    if (typeof model !== 'string' || !model.trim() || !apiKey) throw new Error('settings');
    return { protocol: 'chat-completions', model, baseUrl: url, apiKey };
  } catch {
    throw Object.assign(new Error('LLM_API_KEY, LLM_MODEL, Chat Completions API 주소를 확인하세요.'), { kind: 'configuration' });
  }
}

export function chatCompletionsClient(settings, options = {}) {
  const { maxCompletionTokens, ...httpOptions } = options;
  return {
    async complete(messages) {
      const data = await requestJson(`${settings.baseUrl}/chat/completions`, {
        ...httpOptions,
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.model, messages, stream: false, store: false,
          ...(maxCompletionTokens ? { max_completion_tokens: maxCompletionTokens } : {}) }),
      });
      const usage = tokenUsage(data?.usage);
      const choice = data?.choices?.[0];
      if (typeof choice?.message?.content !== 'string' || !choice.message.content.trim()) {
        throw Object.assign(new Error('LLM이 텍스트 답변을 반환하지 않았습니다.'), { kind: 'invalid_response', usage });
      }
      if (choice.finish_reason !== 'stop') {
        throw Object.assign(new Error('LLM 답변이 완성되지 않았습니다.'), { kind: 'incomplete', usage });
      }
      return { text: choice.message.content, usage, model: data.model || settings.model };
    },
  };
}
