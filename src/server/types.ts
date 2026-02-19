export type AgentId = 'claude' | 'codex' | 'gemini';

export type SenderType = 'user' | 'agent' | 'system';

export interface Room {
  id: string;
  title: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderType: SenderType;
  agentId: AgentId | null;
  content: string;
  createdAt: string;
}

export interface AgentSession {
  roomId: string;
  agentId: AgentId;
  sessionId: string;
  updatedAt: string;
}

export interface AgentRunInput {
  roomId: string;
  prompt: string;
  transcript: ChatMessage[];
  sessionId?: string;
  timeoutMs: number;
}

export interface AgentRunResult {
  text: string;
  sessionId?: string;
  rawEvents: Array<Record<string, unknown>>;
}

export interface AgentClient {
  id: AgentId;
  run(input: AgentRunInput): Promise<AgentRunResult>;
}

export interface OrchestrationOptions {
  roomId: string;
  userMessage: ChatMessage;
}

export interface ServerEvent {
  type: 'message' | 'status' | 'error';
  roomId: string;
  payload: unknown;
}
