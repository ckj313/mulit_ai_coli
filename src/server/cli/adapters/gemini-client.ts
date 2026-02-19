import type { AgentClient, AgentRunInput, AgentRunResult } from '../../types.js';

interface OpenRouterError {
  message?: string;
}

interface OpenRouterChoiceMessage {
  content?: string | Array<{ type?: string; text?: string }>;
}

interface OpenRouterChoice {
  message?: OpenRouterChoiceMessage;
}

interface OpenRouterResponse {
  id?: string;
  choices?: OpenRouterChoice[];
  error?: OpenRouterError;
}

function extractMessageText(message: OpenRouterChoiceMessage | undefined): string {
  if (!message) {
    return '';
  }

  const content = message.content;
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text.trim() : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return '';
}

export class GeminiClient implements AgentClient {
  public readonly id = 'gemini' as const;

  public async run(input: AgentRunInput): Promise<AgentRunResult> {
    const apiKey = process.env['OPENROUTER_API_KEY'];
    if (!apiKey) {
      throw new Error('未配置 OPENROUTER_API_KEY，无法调用 Gemini(OpenRouter) 模型。');
    }

    const model = process.env['OPENROUTER_GEMINI_MODEL'] ?? 'google/gemini-2.5-flash';
    const referer = process.env['OPENROUTER_HTTP_REFERER'] ?? 'http://localhost:3466';
    const appName = process.env['OPENROUTER_APP_NAME'] ?? 'Multi AI Coli';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    let data: OpenRouterResponse;
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-Title': appName,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: input.prompt,
            },
          ],
          temperature: 0.3,
        }),
        signal: controller.signal,
      });

      const raw = (await response.json()) as OpenRouterResponse;
      data = raw;

      if (!response.ok) {
        const message = raw.error?.message ?? `HTTP ${response.status}`;
        throw new Error(`OpenRouter 请求失败：${message}`);
      }
    } finally {
      clearTimeout(timeout);
    }

    if (data.error?.message) {
      throw new Error(`OpenRouter 返回错误：${data.error.message}`);
    }

    const text =
      extractMessageText(data.choices?.[0]?.message) || 'Gemini(OpenRouter) 没有返回可解析内容。';

    return {
      text,
      sessionId: typeof data.id === 'string' ? data.id : input.sessionId,
      rawEvents: [data as Record<string, unknown>],
    };
  }
}
