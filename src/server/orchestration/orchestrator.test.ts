import { afterEach, describe, expect, it } from 'vitest';

import { CliRunError } from '../cli/run-cli.js';
import type { AppConfig } from '../config.js';
import type { AgentClient, AgentId, AgentRunInput, AgentRunResult } from '../types.js';
import { RoomStore } from '../storage/store.js';
import { WsHub } from '../ws-hub.js';
import { Orchestrator } from './orchestrator.js';

class FakeAgent implements AgentClient {
  public readonly id: AgentId;

  private readonly outputs: string[];

  public constructor(id: AgentId, outputs: string[]) {
    this.id = id;
    this.outputs = outputs;
  }

  public async run(_input: AgentRunInput): Promise<AgentRunResult> {
    const text = this.outputs.shift() ?? `${this.id} default`;
    return {
      text,
      rawEvents: [],
      sessionId: `${this.id}-session`,
    };
  }
}

class BrokenAgent implements AgentClient {
  public readonly id: AgentId;

  public constructor(id: AgentId) {
    this.id = id;
  }

  public async run(_input: AgentRunInput): Promise<AgentRunResult> {
    throw new CliRunError({
      kind: 'timeout',
      command: 'claude',
      message: 'claude 调用超时',
    });
  }
}

const baseConfig: AppConfig = {
  port: 0,
  dataDir: '/tmp',
  databasePath: ':memory:',
  maxRecentMessages: 20,
  maxA2ADepth: 8,
  maxTurnsPerAgent: 3,
  agentTimeoutMs: 10_000,
  workspaceDir: process.cwd(),
};

describe('Orchestrator', () => {
  const stores: RoomStore[] = [];

  afterEach(() => {
    for (const store of stores) {
      store.close();
    }
    stores.length = 0;
  });

  it('Claude 首轮可派发给 Codex 和 Gemini，并支持继续 @ 回 Claude', async () => {
    const store = new RoomStore(':memory:');
    stores.push(store);

    const room = store.createRoom('test');
    const userMessage = store.saveMessage({
      roomId: room.id,
      senderType: 'user',
      content: '请开始实现',
    });

    const orchestrator = new Orchestrator({
      config: baseConfig,
      store,
      wsHub: new WsHub(),
      agents: {
        claude: new FakeAgent('claude', ['我先拆解任务\n@codex 请安全审查\n@gemini 请做视觉方向', '收敛完成']),
        codex: new FakeAgent('codex', ['发现两个风险，@claude 请修复']),
        gemini: new FakeAgent('gemini', ['视觉方案已给出']),
      },
    });

    await orchestrator.runForMessage({ roomId: room.id, userMessage });

    const agentMessages = store
      .listMessages(room.id)
      .filter((message) => message.senderType === 'agent')
      .map((message) => message.agentId);

    expect(agentMessages).toEqual(['claude', 'codex', 'gemini', 'claude']);
  });

  it('用户只 @claude 时仅 Claude 响应', async () => {
    const store = new RoomStore(':memory:');
    stores.push(store);

    const room = store.createRoom('mention only');
    const userMessage = store.saveMessage({
      roomId: room.id,
      senderType: 'user',
      content: '@claude 做一个首页方案',
    });

    const orchestrator = new Orchestrator({
      config: baseConfig,
      store,
      wsHub: new WsHub(),
      agents: {
        claude: new FakeAgent('claude', ['我先给出架构草图']),
        codex: new FakeAgent('codex', ['我给出测试计划']),
        gemini: new FakeAgent('gemini', ['我给出视觉提案']),
      },
    });

    await orchestrator.runForMessage({ roomId: room.id, userMessage });

    const agentMessages = store
      .listMessages(room.id)
      .filter((message) => message.senderType === 'agent')
      .map((message) => message.agentId);

    expect(agentMessages).toEqual(['claude']);
  });

  it('用户 @codex 和 @gemini 时两者都会响应', async () => {
    const store = new RoomStore(':memory:');
    stores.push(store);

    const room = store.createRoom('mention two');
    const userMessage = store.saveMessage({
      roomId: room.id,
      senderType: 'user',
      content: '@codex 先看安全，@gemini 再给UI建议',
    });

    const orchestrator = new Orchestrator({
      config: {
        ...baseConfig,
        maxA2ADepth: 2,
      },
      store,
      wsHub: new WsHub(),
      agents: {
        claude: new FakeAgent('claude', ['unused']),
        codex: new FakeAgent('codex', ['安全建议']),
        gemini: new FakeAgent('gemini', ['视觉建议']),
      },
    });

    await orchestrator.runForMessage({ roomId: room.id, userMessage });

    const agentMessages = store
      .listMessages(room.id)
      .filter((message) => message.senderType === 'agent')
      .map((message) => message.agentId);

    expect(agentMessages).toEqual(['codex', 'gemini']);
  });

  it('循环 @ 会被最大轮次限制截断', async () => {
    const store = new RoomStore(':memory:');
    stores.push(store);

    const room = store.createRoom('loop guard');
    const userMessage = store.saveMessage({
      roomId: room.id,
      senderType: 'user',
      content: '触发循环',
    });

    const orchestrator = new Orchestrator({
      config: {
        ...baseConfig,
        maxA2ADepth: 5,
      },
      store,
      wsHub: new WsHub(),
      agents: {
        claude: new FakeAgent('claude', Array.from({ length: 10 }, () => '@codex')),
        codex: new FakeAgent('codex', Array.from({ length: 10 }, () => '@claude')),
        gemini: new FakeAgent('gemini', ['unused']),
      },
    });

    await orchestrator.runForMessage({ roomId: room.id, userMessage });

    const agentMessages = store
      .listMessages(room.id)
      .filter((message) => message.senderType === 'agent');

    expect(agentMessages).toHaveLength(5);
  });

  it('失败消息只给下一步，不暴露完整提示词', async () => {
    const store = new RoomStore(':memory:');
    stores.push(store);

    const room = store.createRoom('error sanitize');
    const userMessage = store.saveMessage({
      roomId: room.id,
      senderType: 'user',
      content: '@claude 给我一句话',
    });

    const orchestrator = new Orchestrator({
      config: {
        ...baseConfig,
        maxA2ADepth: 1,
      },
      store,
      wsHub: new WsHub(),
      agents: {
        claude: new BrokenAgent('claude'),
        codex: new FakeAgent('codex', ['unused']),
        gemini: new FakeAgent('gemini', ['unused']),
      },
    });

    await orchestrator.runForMessage({ roomId: room.id, userMessage });

    const lastAgentMessage = store
      .listMessages(room.id)
      .filter((message) => message.senderType === 'agent')
      .at(-1);

    expect(lastAgentMessage?.content).toContain('下一步：');
    expect(lastAgentMessage?.content).not.toContain('房间历史消息如下');
  });
});
