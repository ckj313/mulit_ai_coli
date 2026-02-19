import { runCli } from '../run-cli.js';
import { mergeChunks, parseCodexEvent, type ParseAccumulator } from './parsers.js';
import type { AgentClient, AgentRunInput, AgentRunResult } from '../../types.js';

export class CodexClient implements AgentClient {
  public readonly id = 'codex' as const;

  public async run(input: AgentRunInput): Promise<AgentRunResult> {
    const acc: ParseAccumulator = { chunks: [], sessionId: input.sessionId };
    const command = process.env['CODEX_BIN'] ?? 'codex';

    const args = [
      'exec',
      input.prompt,
      '--json',
      '--sandbox',
      process.env['CODEX_SANDBOX'] ?? 'workspace-write',
      '--skip-git-repo-check',
      '--ephemeral',
    ];

    const result = await runCli({
      command,
      args,
      cwd: process.cwd(),
      timeoutMs: input.timeoutMs,
      onJsonEvent: (event) => {
        parseCodexEvent(acc, event);
      },
      onTextLine: (line) => {
        if (line.trim()) {
          acc.chunks.push(line.trim());
        }
      },
    });

    const text = mergeChunks(acc.chunks) || 'Codex 没有返回可解析内容。';

    return {
      text,
      sessionId: acc.sessionId,
      rawEvents: result.events,
    };
  }
}
