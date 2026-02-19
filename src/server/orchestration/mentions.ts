import type { AgentId } from '../types.js';

const MENTION_PATTERNS: Record<AgentId, string[]> = {
  claude: ['@claude', '@布偶猫', '@architect'],
  codex: ['@codex', '@缅因猫', '@reviewer'],
  gemini: ['@gemini', '@暹罗猫', '@designer'],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractMentions(text: string, currentAgent?: AgentId): AgentId[] {
  const stripped = text.replace(/```[\s\S]*?```/g, '');
  const found: AgentId[] = [];

  const agentIds = Object.keys(MENTION_PATTERNS) as AgentId[];
  for (const agentId of agentIds) {
    if (currentAgent && agentId === currentAgent) {
      continue;
    }

    const patterns = MENTION_PATTERNS[agentId];
    const matched = patterns.some((pattern) => {
      const regex = new RegExp(
        `(^|[\\s，。,:：!！?？])${escapeRegExp(pattern)}(?=\\s|$|[，。,:：!！?？])`,
        'im',
      );
      return regex.test(stripped);
    });

    if (matched) {
      found.push(agentId);
    }
  }

  return found;
}

export function defaultDelegatesFor(agentId: AgentId): AgentId[] {
  if (agentId === 'claude') {
    return ['codex', 'gemini'];
  }
  return [];
}
