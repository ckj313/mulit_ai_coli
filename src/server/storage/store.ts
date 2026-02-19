import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

import type { AgentId, AgentSession, ChatMessage, Room, SenderType } from '../types.js';

export class RoomStore {
  private readonly db: Database.Database;

  public constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      const parentDir = path.dirname(dbPath);
      fs.mkdirSync(parentDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  public close(): void {
    this.db.close();
  }

  public createRoom(title?: string): Room {
    const now = new Date().toISOString();
    const room: Room = {
      id: uuidv4(),
      title: (title && title.trim()) || `协作房间 ${now.slice(0, 10)}`,
      createdAt: now,
    };

    this.db
      .prepare('INSERT INTO rooms (id, title, created_at) VALUES (?, ?, ?)')
      .run(room.id, room.title, room.createdAt);

    return room;
  }

  public listRooms(): Room[] {
    const rows = this.db
      .prepare('SELECT id, title, created_at AS createdAt FROM rooms ORDER BY created_at DESC')
      .all() as Room[];

    return rows;
  }

  public getRoom(roomId: string): Room | null {
    const room = this.db
      .prepare('SELECT id, title, created_at AS createdAt FROM rooms WHERE id = ?')
      .get(roomId) as Room | undefined;

    return room ?? null;
  }

  public saveMessage(input: {
    roomId: string;
    senderType: SenderType;
    agentId?: AgentId | null;
    content: string;
  }): ChatMessage {
    const now = new Date().toISOString();
    const message: ChatMessage = {
      id: uuidv4(),
      roomId: input.roomId,
      senderType: input.senderType,
      agentId: input.agentId ?? null,
      content: input.content,
      createdAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO messages (id, room_id, sender_type, agent_id, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        message.id,
        message.roomId,
        message.senderType,
        message.agentId,
        message.content,
        message.createdAt,
      );

    return message;
  }

  public getMessage(messageId: string): ChatMessage | null {
    const message = this.db
      .prepare(
        `SELECT id, room_id AS roomId, sender_type AS senderType, agent_id AS agentId,
                content, created_at AS createdAt
         FROM messages
         WHERE id = ?`,
      )
      .get(messageId) as ChatMessage | undefined;

    return message ?? null;
  }

  public listMessages(roomId: string, limit = 200): ChatMessage[] {
    const rows = this.db
      .prepare(
        `SELECT id, room_id AS roomId, sender_type AS senderType, agent_id AS agentId,
                content, created_at AS createdAt
         FROM messages
         WHERE room_id = ?
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(roomId, limit) as ChatMessage[];

    return rows;
  }

  public getRecentMessages(roomId: string, limit = 36): ChatMessage[] {
    const rows = this.db
      .prepare(
        `SELECT id, room_id AS roomId, sender_type AS senderType, agent_id AS agentId,
                content, created_at AS createdAt
         FROM messages
         WHERE room_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(roomId, limit) as ChatMessage[];

    return rows.reverse();
  }

  public getAgentSession(roomId: string, agentId: AgentId): AgentSession | null {
    const row = this.db
      .prepare(
        `SELECT room_id AS roomId, agent_id AS agentId, session_id AS sessionId,
                updated_at AS updatedAt
         FROM agent_sessions
         WHERE room_id = ? AND agent_id = ?`,
      )
      .get(roomId, agentId) as AgentSession | undefined;

    return row ?? null;
  }

  public saveAgentSession(roomId: string, agentId: AgentId, sessionId: string): void {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO agent_sessions (room_id, agent_id, session_id, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(room_id, agent_id)
         DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at`,
      )
      .run(roomId, agentId, sessionId, now);
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        sender_type TEXT NOT NULL,
        agent_id TEXT,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_room_created
      ON messages(room_id, created_at);

      CREATE TABLE IF NOT EXISTS agent_sessions (
        room_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(room_id, agent_id),
        FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
      );
    `);
  }
}
