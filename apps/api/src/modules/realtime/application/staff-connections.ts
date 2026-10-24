import type { StaffWSMessage } from '@conciergeiq/contracts';

/** The parts of a WebSocket the registry uses. */
export interface StaffSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface Connection {
  userId: string;
  socket: StaffSocket;
}

/** Open staff dashboards, grouped by hotel so a message never reaches another hotel. */
export class StaffConnections {
  private readonly byHotel = new Map<string, Set<Connection>>();

  add(hotelId: string, userId: string, socket: StaffSocket): () => void {
    const connection = { userId, socket };
    const connections = this.byHotel.get(hotelId) ?? new Set();
    connections.add(connection);
    this.byHotel.set(hotelId, connections);

    return () => connections.delete(connection);
  }

  broadcast(hotelId: string, message: StaffWSMessage): void {
    const payload = JSON.stringify(message);
    for (const { socket } of this.byHotel.get(hotelId) ?? []) {
      socket.send(payload);
    }
  }

  /** Tells a deactivated user's dashboards to sign out, then closes them. */
  revokeUser(hotelId: string, userId: string): void {
    const message: StaffWSMessage = { type: 'SESSION_REVOKED', payload: { reason: 'deactivated' } };
    for (const connection of this.byHotel.get(hotelId) ?? []) {
      if (connection.userId !== userId) continue;
      connection.socket.send(JSON.stringify(message));
      connection.socket.close(4001, 'Account deactivated');
    }
  }
}
