import { createServer } from 'node:http';
import { URL } from 'node:url';
import { WebSocketServer } from 'ws';

import { createApp } from './app.js';
import { createDefaultAgents } from './cli/registry.js';
import { loadConfig } from './config.js';
import { Orchestrator } from './orchestration/orchestrator.js';
import { RoomStore } from './storage/store.js';
import { WsHub } from './ws-hub.js';

const config = loadConfig();
const store = new RoomStore(config.databasePath);
const wsHub = new WsHub();
const agents = createDefaultAgents();
const orchestrator = new Orchestrator({
  config,
  store,
  wsHub,
  agents,
});

const app = createApp({
  config,
  store,
  wsHub,
  orchestrator,
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket, request) => {
  const base = `http://${request.headers.host ?? 'localhost'}`;
  const url = new URL(request.url ?? '/', base);
  const roomId = url.searchParams.get('roomId');

  if (!roomId || !store.getRoom(roomId)) {
    socket.close(1008, 'invalid room');
    return;
  }

  wsHub.register(roomId, socket);

  socket.send(
    JSON.stringify({
      type: 'status',
      roomId,
      payload: {
        phase: 'connected',
      },
    }),
  );
});

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Multi AI Coli server started: http://localhost:${config.port}`);
});

function shutdown(): void {
  wss.close();
  server.close(() => {
    store.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
