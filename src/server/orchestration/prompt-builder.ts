import type { AgentId, ChatMessage } from '../types.js';
import { AGENT_PROFILES, getAgentName } from './roles.js';

export interface BuildPromptInput {
  agentId: AgentId;
  roomId: string;
  userMessage: ChatMessage;
  transcript: ChatMessage[];
  turnIndex: number;
}

function formatTranscript(messages: ChatMessage[]): string {
  if (messages.length === 0) {
    return '(暂无历史消息)';
  }

  return messages
    .map((message) => {
      const speaker = message.senderType === 'user' ? '用户' : getAgentName(message.agentId);
      return `[${message.createdAt}] ${speaker}: ${message.content}`;
    })
    .join('\n');
}

export function buildAgentPrompt(input: BuildPromptInput): string {
  const profile = AGENT_PROFILES[input.agentId];
  const transcript = formatTranscript(input.transcript);

  return [
    `你正在一个三 AI 协作房间中工作，房间 ID: ${input.roomId}。`,
    '',
    `你的角色: ${profile.displayName}`,
    `职责: ${profile.responsibility}`,
    `协作规则: ${profile.collaborationRule}`,
    '',
    '统一约束:',
    '1. 所有回复必须是中文。',
    '2. 直接给可执行结论，避免空话。',
    '3. 如果需要其他 AI，必须在独立行使用 @claude / @codex / @gemini。',
    '4. 被 @ 到时要在同一房间继续推进，不要丢失上下文。',
    '5. 你能看到完整房间历史，请基于历史继续，不要重复询问已知信息。',
    '',
    `当前这是你本轮的第 ${input.turnIndex} 次执行。`,
    '',
    '房间历史消息如下：',
    transcript,
    '',
    '当前需要处理的用户原始任务：',
    input.userMessage.content,
    '',
    '请给出本轮回复：',
  ].join('\n');
}
