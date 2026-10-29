import type { StaffWSMessage } from '@conciergeiq/contracts';
import { ConnectionManager, type SocketLike } from '../connection-manager.js';

/** The parts of a WebSocket the registry uses. */
export interface StaffSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  terminate?(): void;
  ping?(data?: unknown): void;
  on?(event: string, listener: (...args: unknown[]) => void): unknown;
}

/** Open staff dashboards, backed by ConnectionManager to ensure clean channel routing and heartbeat cleanup. */
export class StaffConnections {
  constructor(private readonly connectionManager: ConnectionManager = new ConnectionManager()) {}

  add(hotelId: string, userId: string, socket: StaffSocket): () => void {
    return this.connectionManager.register(socket as unknown as SocketLike, {
      clientType: 'staff',
      hotelId,
      userId,
      channels: [`hotel:${hotelId}`, `hotel:${hotelId}:staff`, `staff:${userId}`],
    });
  }

  broadcast(hotelId: string, message: StaffWSMessage): void {
    this.connectionManager.broadcast(`hotel:${hotelId}:staff`, message);
  }

  /** Tells a deactivated user's dashboards to sign out, then closes them. */
  revokeUser(hotelId: string, userId: string): void {
    const message: StaffWSMessage = { type: 'SESSION_REVOKED', payload: { reason: 'deactivated' } };
    const sockets = this.connectionManager
      .getSocketsByChannel(`staff:${userId}`)
      .filter((socket) => this.connectionManager.getMetadata(socket)?.hotelId === hotelId);
    for (const socket of sockets) {
      try {
        socket.send(JSON.stringify(message));
        socket.close(4001, 'Account deactivated');
      } catch {
        // ignore
      }
    }
  }

  getConnectionManager(): ConnectionManager {
    return this.connectionManager;
  }
}
