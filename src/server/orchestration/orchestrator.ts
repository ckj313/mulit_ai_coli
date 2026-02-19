import type { AppConfig } from '../config.js';
import type { AgentClient, AgentId, ChatMessage, OrchestrationOptions } from '../types.js';
import { RoomStore } from '../storage/store.js';
import { WsHub } from '../ws-hub.js';
import { buildAgentPrompt } from './prompt-builder.js';
import { defaultDelegatesFor, extractMentions } from './mentions.js';

interface OrchestratorDeps {
  config: AppConfig;
  store: RoomStore;
  wsHub: WsHub;
  agents: Record<AgentId, AgentClient>;
}

function shortError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class Orchestrator {
  private readonly config: AppConfig;
  private readonly store: RoomStore;
  private readonly wsHub: WsHub;
  private readonly agents: Record<AgentId, AgentClient>;
  private readonly roomLocks = new Map<string, Promise<void>>();

  public constructor(deps: OrchestratorDeps) {
    this.config = deps.config;
    this.store = deps.store;
    this.wsHub = deps.wsHub;
    this.agents = deps.agents;
  }

  public runForMessage(options: OrchestrationOptions): Promise<void> {
    const previous = this.roomLocks.get(options.roomId) ?? Promise.resolve();

    const next = previous
      .catch(() => {
        // 保持链条不断裂，让后续消息仍可执行
      })
      .then(async () => this.execute(options));

    this.roomLocks.set(options.roomId, next);

    return next.finally(() => {
      if (this.roomLocks.get(options.roomId) === next) {
        this.roomLocks.delete(options.roomId);
      }
    });
  }

  private async execute(options: OrchestrationOptions): Promise<void> {
    const queue: AgentId[] = ['claude'];
    const turnsByAgent: Record<AgentId, number> = {
      claude: 0,
      codex: 0,
      gemini: 0,
    };

    let totalTurns = 0;

    this.wsHub.emit({
      type: 'status',
      roomId: options.roomId,
      payload: {
        phase: 'running',
        queue,
      },
    });

    while (queue.length > 0 && totalTurns < this.config.maxA2ADepth) {
      const agentId = queue.shift();
      if (!agentId) {
        break;
      }

      if (turnsByAgent[agentId] >= this.config.maxTurnsPerAgent) {
        continue;
      }

      turnsByAgent[agentId] += 1;
      totalTurns += 1;

      this.wsHub.emit({
        type: 'status',
        roomId: options.roomId,
        payload: {
          phase: 'agent_running',
          agentId,
          turn: turnsByAgent[agentId],
          queue,
        },
      });

      const transcript = this.store.getRecentMessages(
        options.roomId,
        this.config.maxRecentMessages,
      );
      const session = this.store.getAgentSession(options.roomId, agentId);
      const prompt = buildAgentPrompt({
        agentId,
        roomId: options.roomId,
        userMessage: options.userMessage,
        transcript,
        turnIndex: turnsByAgent[agentId],
      });

      let agentText = '';

      try {
        const result = await this.agents[agentId].run({
          roomId: options.roomId,
          prompt,
          transcript,
          sessionId: session?.sessionId,
          timeoutMs: this.config.agentTimeoutMs,
        });

        agentText = result.text;

        if (result.sessionId) {
          this.store.saveAgentSession(options.roomId, agentId, result.sessionId);
        }
      } catch (error) {
        agentText = `执行失败：${shortError(error)}`;
      }

      const message = this.store.saveMessage({
        roomId: options.roomId,
        senderType: 'agent',
        agentId,
        content: agentText,
      });

      this.wsHub.emit({
        type: 'message',
        roomId: options.roomId,
        payload: message,
      });

      let mentions = extractMentions(agentText, agentId);

      if (agentId === 'claude' && totalTurns === 1 && mentions.length === 0) {
        mentions = defaultDelegatesFor(agentId);
      }

      for (const target of mentions) {
        const canRun = turnsByAgent[target] < this.config.maxTurnsPerAgent;
        const stillHasCapacity = totalTurns + queue.length < this.config.maxA2ADepth;
        const notQueued = !queue.includes(target);

        if (canRun && stillHasCapacity && notQueued) {
          queue.push(target);
        }
      }
    }

    this.wsHub.emit({
      type: 'status',
      roomId: options.roomId,
      payload: {
        phase: 'idle',
        turnsByAgent,
        totalTurns,
      },
    });
  }

  public notifySystem(roomId: string, content: string): ChatMessage {
    const message = this.store.saveMessage({
      roomId,
      senderType: 'system',
      content,
    });

    this.wsHub.emit({
      type: 'message',
      roomId,
      payload: message,
    });

    return message;
  }
}
