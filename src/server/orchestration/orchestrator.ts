import type { AppConfig } from '../config.js';
import type { AgentClient, AgentId, ChatMessage, OrchestrationOptions } from '../types.js';
import { CliRunError } from '../cli/run-cli.js';
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

function getAgentDisplayName(agentId: AgentId): string {
  if (agentId === 'claude') {
    return 'Claude';
  }
  if (agentId === 'codex') {
    return 'Codex';
  }
  return 'Gemini';
}

function firstStderrLine(stderr?: string): string | null {
  if (!stderr) {
    return null;
  }

  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  return lines[0].slice(0, 120);
}

function formatAgentFailureMessage(agentId: AgentId, error: unknown): string {
  const agentName = getAgentDisplayName(agentId);

  if (error instanceof CliRunError) {
    if (error.kind === 'timeout') {
      return `${agentName} 暂时没有返回结果。\n下一步：请重试一次；若任务较大，请先让它只给 3 步计划。`;
    }

    if (error.kind === 'non_zero_exit') {
      const hint = firstStderrLine(error.stderr);
      if (hint) {
        return `${agentName} 当前执行失败（${hint}）。\n下一步：检查账号登录/额度后再重试。`;
      }
      return `${agentName} 当前执行失败。\n下一步：检查账号登录/额度后再重试。`;
    }

    return `${agentName} 当前不可用。\n下一步：请重试；若仍失败，检查本机 ${agentName} 配置。`;
  }

  const message = shortError(error);
  if (message) {
    return `${agentName} 当前执行失败。\n下一步：请重试；若仍失败，检查环境配置。\n原因：${message.slice(0, 120)}`;
  }
  return `${agentName} 当前执行失败。\n下一步：请重试；若仍失败，检查环境配置。`;
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
        agentText = formatAgentFailureMessage(agentId, error);
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
