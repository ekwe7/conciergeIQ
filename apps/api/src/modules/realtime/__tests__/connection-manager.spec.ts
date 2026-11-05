import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { ConnectionManager, type SocketLike } from '../connection-manager.js';

class MockSocket extends EventEmitter implements SocketLike {
  public sentMessages: string[] = [];
  public closeCode?: number;
  public closeReason?: string;
  public terminated = false;
  public pingCount = 0;

  send(data: string, cb?: (err?: Error) => void): void {
    this.sentMessages.push(data);
    cb?.();
  }

  close(code?: number, reason?: string): void {
    this.closeCode = code;
    this.closeReason = reason;
    this.emit('close', code, reason);
  }

  terminate(): void {
    this.terminated = true;
    this.emit('close', 1006, 'Terminated');
  }

  ping(): void {
    this.pingCount++;
  }
}

describe('ConnectionManager', () => {
  it('registers a guest socket and derives tenant and session channels', () => {
    const manager = new ConnectionManager();
    const socket = new MockSocket();

    const unregister = manager.register(socket, {
      clientType: 'guest',
      hotelId: 'hotel-alpha',
      sessionId: 'sess-101',
      roomId: 'room-202',
      roomNumber: '202',
      stayId: 'stay-303',
      guestName: 'Ada Lovelace',
    });

    expect(manager.getActiveConnectionCount()).toBe(1);
    expect(manager.getSocketsByChannel('hotel:hotel-alpha')).toEqual([socket]);
    expect(manager.getSocketsByChannel('hotel:hotel-alpha:guests')).toEqual([socket]);
    expect(manager.getSocketsByChannel('guest:sess-101')).toEqual([socket]);
    expect(manager.getSocketsByChannel('session:sess-101')).toEqual([socket]);
    expect(manager.getSocketsByChannel('stay:stay-303')).toEqual([socket]);
    expect(manager.getSocketsByChannel('room:hotel-alpha:room-202')).toEqual([socket]);
    expect(manager.getSocketsByChannel('room:room-202')).toEqual([socket]);

    const metadata = manager.getMetadata(socket);
    expect(metadata).toMatchObject({
      clientType: 'guest',
      hotelId: 'hotel-alpha',
      sessionId: 'sess-101',
      stayId: 'stay-303',
    });

    unregister();
    expect(manager.getActiveConnectionCount()).toBe(0);
    expect(manager.getSocketsByChannel('hotel:hotel-alpha')).toEqual([]);
    expect(manager.getChannelCount()).toBe(0);
  });

  it('registers a staff socket and derives staff-specific channels', () => {
    const manager = new ConnectionManager();
    const socket = new MockSocket();

    manager.register(socket, {
      clientType: 'staff',
      hotelId: 'hotel-beta',
      userId: 'user-99',
      role: 'receptionist',
    });

    expect(manager.getSocketsByChannel('hotel:hotel-beta')).toEqual([socket]);
    expect(manager.getSocketsByChannel('hotel:hotel-beta:staff')).toEqual([socket]);
    expect(manager.getSocketsByChannel('staff:user-99')).toEqual([socket]);
    expect(manager.getSocketsByChannel('user:user-99')).toEqual([socket]);
    expect(manager.getSocketsByChannel('hotel:hotel-beta:guests')).toEqual([]);
  });

  it('automatically unregisters socket and cleans up channels when socket closes', () => {
    const manager = new ConnectionManager();
    const socket = new MockSocket();

    manager.register(socket, {
      clientType: 'guest',
      hotelId: 'hotel-gamma',
      sessionId: 'sess-abc',
      roomId: 'room-1',
      stayId: 'stay-1',
    });

    expect(manager.getActiveConnectionCount()).toBe(1);
    expect(manager.getChannelCount()).toBeGreaterThan(0);

    // Socket emits close
    socket.close(1000, 'Normal Closure');

    expect(manager.getActiveConnectionCount()).toBe(0);
    expect(manager.getSocketsByChannel('hotel:hotel-gamma')).toEqual([]);
    expect(manager.getChannelCount()).toBe(0);
  });

  it('allows dynamic manual channel subscription and unsubscription', () => {
    const manager = new ConnectionManager();
    const socket = new MockSocket();

    manager.register(socket, {
      clientType: 'guest',
      hotelId: 'hotel-delta',
      sessionId: 'sess-xyz',
      roomId: 'room-2',
      stayId: 'stay-2',
    });

    manager.subscribe(socket, 'announcements:urgent');
    expect(manager.getSocketsByChannel('announcements:urgent')).toEqual([socket]);

    manager.unsubscribe(socket, 'announcements:urgent');
    expect(manager.getSocketsByChannel('announcements:urgent')).toEqual([]);
  });

  it('broadcasts messages strictly to target channel subscribers', () => {
    const manager = new ConnectionManager();
    const socket1 = new MockSocket();
    const socket2 = new MockSocket();

    manager.register(socket1, {
      clientType: 'guest',
      hotelId: 'hotel-1',
      sessionId: 'sess-1',
      roomId: 'room-1',
      stayId: 'stay-1',
    });

    manager.register(socket2, {
      clientType: 'guest',
      hotelId: 'hotel-2',
      sessionId: 'sess-2',
      roomId: 'room-2',
      stayId: 'stay-2',
    });

    manager.broadcast('hotel:hotel-1', { type: 'NOTIFICATION', message: 'Welcome to Hotel 1' });

    expect(socket1.sentMessages).toHaveLength(1);
    expect(JSON.parse(socket1.sentMessages[0]!)).toEqual({
      type: 'NOTIFICATION',
      message: 'Welcome to Hotel 1',
    });
    expect(socket2.sentMessages).toHaveLength(0);
  });

  describe('Ping/Pong Heartbeat Protocol', () => {
    it('issues ping on heartbeat sweep to healthy sockets', () => {
      const manager = new ConnectionManager();
      const socket = new MockSocket();

      manager.register(socket, {
        clientType: 'staff',
        hotelId: 'hotel-h',
        userId: 'staff-1',
      });

      expect(socket.pingCount).toBe(0);

      // Cycle 1: socket is initially marked alive, so checkHeartbeats sends ping
      manager.checkHeartbeats();
      expect(socket.pingCount).toBe(1);
      expect(socket.terminated).toBe(false);
      expect(manager.getActiveConnectionCount()).toBe(1);
    });

    it('keeps responsive connection alive when client replies with pong', () => {
      const manager = new ConnectionManager();
      const socket = new MockSocket();

      manager.register(socket, {
        clientType: 'staff',
        hotelId: 'hotel-h',
        userId: 'staff-1',
      });

      // Cycle 1: sends ping
      manager.checkHeartbeats();
      expect(socket.pingCount).toBe(1);

      // Client responds with pong
      socket.emit('pong');

      // Cycle 2: socket is alive because it answered pong -> receives another ping
      manager.checkHeartbeats();
      expect(socket.pingCount).toBe(2);
      expect(socket.terminated).toBe(false);
      expect(manager.getActiveConnectionCount()).toBe(1);
    });

    it('terminates and purges dead sockets failing to answer ping within 30-second window', () => {
      const manager = new ConnectionManager();
      const socket = new MockSocket();

      manager.register(socket, {
        clientType: 'guest',
        hotelId: 'hotel-h',
        sessionId: 'sess-dead',
        roomId: 'room-dead',
        stayId: 'stay-dead',
      });

      expect(manager.getActiveConnectionCount()).toBe(1);

      // Cycle 1: sends ping
      manager.checkHeartbeats();
      expect(socket.pingCount).toBe(1);

      // Client does NOT respond with pong!
      // Cycle 2 (30 seconds later): manager detects missing pong
      manager.checkHeartbeats();

      expect(socket.terminated).toBe(true);
      expect(manager.getActiveConnectionCount()).toBe(0);
      expect(manager.getSocketsByChannel('hotel:hotel-h')).toEqual([]);
      expect(manager.getChannelCount()).toBe(0);
    });

    it('cleans up on destroy, stopping interval and terminating all sockets', () => {
      vi.useFakeTimers();
      const manager = new ConnectionManager({ heartbeatIntervalMs: 10_000, autoStartHeartbeat: true });
      const socket = new MockSocket();

      manager.register(socket, {
        clientType: 'staff',
        hotelId: 'hotel-destroy',
        userId: 'staff-d',
      });

      manager.destroy();

      expect(socket.terminated).toBe(true);
      expect(manager.getActiveConnectionCount()).toBe(0);
      vi.useRealTimers();
    });
  });
});
