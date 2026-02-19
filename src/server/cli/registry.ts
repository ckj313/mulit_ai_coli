import { ClaudeClient } from './adapters/claude-client.js';
import { CodexClient } from './adapters/codex-client.js';
import { GeminiClient } from './adapters/gemini-client.js';
import type { AgentClient, AgentId } from '../types.js';

export function createDefaultAgents(): Record<AgentId, AgentClient> {
  return {
    claude: new ClaudeClient(),
    codex: new CodexClient(),
    gemini: new GeminiClient(),
  };
}
