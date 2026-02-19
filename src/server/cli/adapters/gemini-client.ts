import { runCli } from '../run-cli.js';
import { mergeChunks, parseGeminiEvent, type ParseAccumulator } from './parsers.js';
import type { AgentClient, AgentRunInput, AgentRunResult } from '../../types.js';

export class GeminiClient implements AgentClient {
  public readonly id = 'gemini' as const;

  public async run(input: AgentRunInput): Promise<AgentRunResult> {
    const acc: ParseAccumulator = { chunks: [], sessionId: input.sessionId };
    const command = process.env['GEMINI_BIN'] ?? 'gemini';

    const args = [
      input.prompt,
      '--output-format',
      'stream-json',
      '--approval-mode',
      process.env['GEMINI_APPROVAL_MODE'] ?? 'default',
      '--sandbox',
      'true',
    ];

    const result = await runCli({
      command,
      args,
      cwd: process.cwd(),
      timeoutMs: input.timeoutMs,
      onJsonEvent: (event) => {
        parseGeminiEvent(acc, event);
      },
      onTextLine: (line) => {
        if (line.trim()) {
          acc.chunks.push(line.trim());
        }
      },
    });

    const text = mergeChunks(acc.chunks) || 'Gemini 没有返回可解析内容。';

    return {
      text,
      sessionId: acc.sessionId,
      rawEvents: result.events,
    };
  }
}
