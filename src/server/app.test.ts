import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import type { AppConfig } from './config.js';
import type { AgentClient, AgentRunInput, AgentRunResult } from './types.js';
import { Orchestrator } from './orchestration/orchestrator.js';
import { RoomStore } from './storage/store.js';
import { WsHub } from './ws-hub.js';

class StaticAgent implements AgentClient {
  public readonly id: 'claude' | 'codex' | 'gemini';

  public constructor(id: 'claude' | 'codex' | 'gemini') {
    this.id = id;
  }

  public async run(_input: AgentRunInput): Promise<AgentRunResult> {
    return {
      text: `${this.id} ok`,
      rawEvents: [],
      sessionId: `${this.id}-s`,
    };
  }
}

const baseConfig: AppConfig = {
  port: 0,
  dataDir: '/tmp',
  databasePath: ':memory:',
  maxRecentMessages: 20,
  maxA2ADepth: 6,
  maxTurnsPerAgent: 2,
  agentTimeoutMs: 10_000,
  workspaceDir: process.cwd(),
};

describe('createApp', () => {
  const stores: RoomStore[] = [];

  afterEach(() => {
    for (const store of stores) {
      store.close();
    }
    stores.length = 0;
  });

  it('可以创建房间并发送消息', async () => {
    const store = new RoomStore(':memory:');
    stores.push(store);

    const wsHub = new WsHub();
    const orchestrator = new Orchestrator({
      config: baseConfig,
      store,
      wsHub,
      agents: {
        claude: new StaticAgent('claude'),
        codex: new StaticAgent('codex'),
        gemini: new StaticAgent('gemini'),
      },
    });

    const app = createApp({
      config: baseConfig,
      store,
      wsHub,
      orchestrator,
    });

    const roomResponse = await request(app).post('/api/rooms').send({ title: 'API test room' });
    expect(roomResponse.status).toBe(201);

    const roomId = roomResponse.body.room.id as string;

    const messageResponse = await request(app)
      .post(`/api/rooms/${roomId}/messages`)
      .send({ content: '请处理任务' });

    expect(messageResponse.status).toBe(202);
    expect(messageResponse.body.accepted).toBe(true);

    const listResponse = await request(app).get(`/api/rooms/${roomId}/messages`);
    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.messages)).toBe(true);
    expect(listResponse.body.messages.length).toBeGreaterThan(0);
  });
});
