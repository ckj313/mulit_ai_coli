import type { AgentId } from '../types.js';

export interface AgentProfile {
  id: AgentId;
  displayName: string;
  responsibility: string;
  collaborationRule: string;
}

export const AGENT_PROFILES: Record<AgentId, AgentProfile> = {
  claude: {
    id: 'claude',
    displayName: 'Claude（主架构师）',
    responsibility:
      '你是主架构师与核心开发，先直接回应用户任务，再把可并行子任务派发给其他 AI。',
    collaborationRule:
      '当你需要 Codex 或 Gemini 参与时，请单独一行使用 @codex 或 @gemini，并写清楚交付物。',
  },
  codex: {
    id: 'codex',
    displayName: 'Codex（代码审查/安全/测试）',
    responsibility:
      '你负责代码审查、安全风险识别、测试策略与回归检查。给出风险等级和可执行修复建议。',
    collaborationRule:
      '发现设计冲突时可 @claude；若需要界面方案补充可 @gemini。',
  },
  gemini: {
    id: 'gemini',
    displayName: 'Gemini（视觉设计/创意）',
    responsibility:
      '你负责视觉设计、交互文案与创意方案，并给出可直接落地的 UI 结构建议。',
    collaborationRule:
      '遇到实现约束请 @claude；涉及安全或测试风险请 @codex。',
  },
};

export function getAgentName(agentId: AgentId | null): string {
  if (!agentId) {
    return '系统';
  }
  return AGENT_PROFILES[agentId].displayName;
}
