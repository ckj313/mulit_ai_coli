export interface ParseAccumulator {
  chunks: string[];
  sessionId?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pushChunk(acc: ParseAccumulator, value: unknown): void {
  if (typeof value !== 'string') {
    return;
  }
  const text = value.trim();
  if (!text) {
    return;
  }
  acc.chunks.push(text);
}

export function parseClaudeEvent(acc: ParseAccumulator, event: Record<string, unknown>): void {
  const type = event['type'];

  if (typeof event['session_id'] === 'string') {
    acc.sessionId = event['session_id'];
  }

  if (type === 'assistant') {
    const message = asRecord(event['message']);
    const content = message?.['content'];
    if (Array.isArray(content)) {
      for (const item of content) {
        const itemRecord = asRecord(item);
        if (itemRecord?.['type'] === 'text') {
          pushChunk(acc, itemRecord['text']);
        }
      }
    }
  }

  if (type === 'result') {
    pushChunk(acc, event['result']);
  }
}

export function parseCodexEvent(acc: ParseAccumulator, event: Record<string, unknown>): void {
  const type = event['type'];

  if (type === 'thread.started') {
    const threadId = event['thread_id'];
    if (typeof threadId === 'string') {
      acc.sessionId = threadId;
    }
  }

  if (type === 'item.completed') {
    const item = asRecord(event['item']);
    if (!item) {
      return;
    }

    const itemType = item['type'];
    if (itemType === 'agent_message') {
      pushChunk(acc, item['text']);
    }
  }
}

export function parseGeminiEvent(acc: ParseAccumulator, event: Record<string, unknown>): void {
  const type = event['type'];

  if (typeof event['session_id'] === 'string') {
    acc.sessionId = event['session_id'];
  }

  if (type === 'message' && event['role'] === 'model') {
    pushChunk(acc, event['content']);
  }

  if (type === 'message' && event['role'] === 'assistant') {
    pushChunk(acc, event['content']);
  }

  if (type === 'result') {
    const error = asRecord(event['error']);
    if (error) {
      const message = error['message'];
      if (typeof message === 'string') {
        pushChunk(acc, `[Gemini 错误] ${message}`);
      }
    }

    const response = asRecord(event['response']);
    if (response) {
      pushChunk(acc, response['text']);
    }

    pushChunk(acc, event['output']);
  }
}

export function mergeChunks(chunks: string[]): string {
  const deduped: string[] = [];
  let previous = '';

  for (const chunk of chunks) {
    if (chunk === previous) {
      continue;
    }
    deduped.push(chunk);
    previous = chunk;
  }

  return deduped.join('\n').trim();
}
