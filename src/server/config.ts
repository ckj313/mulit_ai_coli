import path from 'node:path';

export interface AppConfig {
  port: number;
  dataDir: string;
  databasePath: string;
  maxRecentMessages: number;
  maxA2ADepth: number;
  maxTurnsPerAgent: number;
  agentTimeoutMs: number;
  workspaceDir: string;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): AppConfig {
  const workspaceDir = process.cwd();
  const dataDir = process.env['AI_ROOM_DATA_DIR'] ?? path.join(workspaceDir, 'data');
  const databasePath = process.env['AI_ROOM_DB_PATH'] ?? path.join(dataDir, 'room.db');

  return {
    port: parseNumber(process.env['PORT'], 3466),
    dataDir,
    databasePath,
    maxRecentMessages: parseNumber(process.env['AI_ROOM_CONTEXT_MESSAGES'], 36),
    maxA2ADepth: parseNumber(process.env['AI_ROOM_MAX_A2A_DEPTH'], 9),
    maxTurnsPerAgent: parseNumber(process.env['AI_ROOM_MAX_AGENT_TURNS'], 3),
    agentTimeoutMs: parseNumber(process.env['AI_ROOM_AGENT_TIMEOUT_MS'], 180000),
    workspaceDir,
  };
}
