import { runCli } from '../run-cli.js';
import { mergeChunks, parseClaudeEvent, type ParseAccumulator } from './parsers.js';
import type { AgentClient, AgentRunInput, AgentRunResult } from '../../types.js';

export class ClaudeClient implements AgentClient {
  public readonly id = 'claude' as const;

  public async run(input: AgentRunInput): Promise<AgentRunResult> {
    const acc: ParseAccumulator = { chunks: [], sessionId: input.sessionId };
    const command = process.env['CLAUDE_BIN'] ?? 'claude';

    const args = [
      '-p',
      input.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'default',
      '--tools',
      '',
      '--model',
      process.env['CLAUDE_MODEL'] ?? 'sonnet',
      '--no-session-persistence',
    ];

    const result = await runCli({
      command,
      args,
      cwd: process.cwd(),
      timeoutMs: input.timeoutMs,
      onJsonEvent: (event) => {
        parseClaudeEvent(acc, event);
      },
      onTextLine: (line) => {
        if (line.trim()) {
          acc.chunks.push(line.trim());
        }
      },
    });

    const text = mergeChunks(acc.chunks) || 'Claude 没有返回可解析内容。';

    return {
      text,
      sessionId: acc.sessionId,
      rawEvents: result.events,
    };
  }
}
