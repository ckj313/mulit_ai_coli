import type { WebSocket } from 'ws';

import type { ServerEvent } from './types.js';

export class WsHub {
  private readonly roomSockets = new Map<string, Set<WebSocket>>();

  public register(roomId: string, socket: WebSocket): void {
    const set = this.roomSockets.get(roomId) ?? new Set<WebSocket>();
    set.add(socket);
    this.roomSockets.set(roomId, set);

    socket.on('close', () => {
      this.unregister(roomId, socket);
    });
  }

  public emit(event: ServerEvent): void {
    const sockets = this.roomSockets.get(event.roomId);
    if (!sockets || sockets.size === 0) {
      return;
    }

    const payload = JSON.stringify(event);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }

  private unregister(roomId: string, socket: WebSocket): void {
    const set = this.roomSockets.get(roomId);
    if (!set) {
      return;
    }

    set.delete(socket);
    if (set.size === 0) {
      this.roomSockets.delete(roomId);
    }
  }
}
