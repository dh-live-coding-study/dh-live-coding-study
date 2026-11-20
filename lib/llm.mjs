import { baseUrl, requestJson } from './core.mjs';

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
      const choice = data?.choices?.[0];
      if (typeof choice?.message?.content !== 'string' || !choice.message.content.trim()) {
        throw Object.assign(new Error('LLM이 텍스트 답변을 반환하지 않았습니다.'), { kind: 'invalid_response' });
      }
      if (choice.finish_reason !== 'stop') {
        throw Object.assign(new Error('LLM 답변이 완성되지 않았습니다.'), { kind: 'incomplete' });
      }
      return { text: choice.message.content, usage: data.usage || null, model: data.model || settings.model };
    },
  };
}
