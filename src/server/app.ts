import express, { type Request, type Response } from 'express';
import { z } from 'zod';

import type { AppConfig } from './config.js';
import { Orchestrator } from './orchestration/orchestrator.js';
import { RoomStore } from './storage/store.js';
import { WsHub } from './ws-hub.js';

const createRoomSchema = z.object({
  title: z.string().trim().min(1).max(60).optional(),
});

const createMessageSchema = z.object({
  content: z.string().trim().min(1).max(8000),
});

export interface AppDeps {
  config: AppConfig;
  store: RoomStore;
  wsHub: WsHub;
  orchestrator: Orchestrator;
}

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    return value[0];
  }
  return null;
}

function ensureDefaultRoom(store: RoomStore): void {
  const rooms = store.listRooms();
  if (rooms.length > 0) {
    return;
  }
  store.createRoom('默认协作房间');
}

export function createApp(deps: AppDeps): express.Express {
  ensureDefaultRoom(deps.store);

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static('public'));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.get('/api/rooms', (_req: Request, res: Response) => {
    res.json({ rooms: deps.store.listRooms() });
  });

  app.post('/api/rooms', (req: Request, res: Response) => {
    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const room = deps.store.createRoom(parsed.data.title);
    res.status(201).json({ room });
  });

  app.get('/api/rooms/:roomId/messages', (req: Request, res: Response) => {
    const roomId = firstParam(req.params['roomId']);
    if (!roomId || !deps.store.getRoom(roomId)) {
      res.status(404).json({ error: '房间不存在' });
      return;
    }

    res.json({ messages: deps.store.listMessages(roomId) });
  });

  app.post('/api/rooms/:roomId/messages', (req: Request, res: Response) => {
    const roomId = firstParam(req.params['roomId']);
    if (!roomId || !deps.store.getRoom(roomId)) {
      res.status(404).json({ error: '房间不存在' });
      return;
    }

    const parsed = createMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const userMessage = deps.store.saveMessage({
      roomId,
      senderType: 'user',
      content: parsed.data.content,
    });

    deps.wsHub.emit({
      type: 'message',
      roomId,
      payload: userMessage,
    });

    void deps.orchestrator.runForMessage({
      roomId,
      userMessage,
    }).catch((error: unknown) => {
      const errorText = error instanceof Error ? error.message : String(error);
      deps.orchestrator.notifySystem(roomId, `编排失败：${errorText}`);
    });

    res.status(202).json({ accepted: true, message: userMessage });
  });

  return app;
}
