import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { StaffRole } from '@conciergeiq/contracts';
import type WebSocket from 'ws';
import { systemClock } from '../../../shared/utils/clock.js';
import { ConnectionManager } from '../connection-manager.js';
import { realtimeWebSocketPlugin } from '../websocket.plugin.js';
import { registerGuestGateway } from '../interface/guest-gateway.js';
import { registerStaffGateway, UNAUTHORIZED_CLOSE_CODE } from '../interface/staff-gateway.js';
import { StaffConnections } from '../application/staff-connections.js';

function createMockGuestToken(claims: {
  sessionId?: string;
  hotelId?: string;
  roomId?: string;
  roomNumber?: string;
  stayId?: string;
  guestName?: string;
} = {}) {
  const data = {
    sessionId: claims.sessionId ?? 'sess-guest-1',
    hotelId: claims.hotelId ?? 'hotel-test',
    roomId: claims.roomId ?? 'room-101',
    roomNumber: claims.roomNumber ?? '101',
    stayId: claims.stayId ?? 'stay-test-1',
    guestName: claims.guestName ?? 'Ada Guest',
    type: 'guest',
  };
  return 'guest.' + Buffer.from(JSON.stringify(data)).toString('base64url');
}

describe('Fastify WebSocket Gateway & Connection Registry', () => {
  let app: FastifyInstance;
  let connectionManager: ConnectionManager;
  let staffConnections: StaffConnections;

  beforeEach(async () => {
    app = Fastify();
    await app.register(fastifyJwt, { secret: 'test-secret-at-least-32-chars-long' });
    connectionManager = new ConnectionManager();
    staffConnections = new StaffConnections(connectionManager);

    await app.register(realtimeWebSocketPlugin, { connectionManager });

    registerGuestGateway(app, { connectionManager, clock: systemClock });
    registerStaffGateway(app, {
      connections: staffConnections,
      clock: systemClock,
      staffFromAccessToken: async (token) => {
        if (token === 'valid-staff-jwt') {
          return {
            id: 'staff-1',
            hotelId: 'hotel-test',
            role: StaffRole.RECEPTIONIST,
            fullName: 'Receptionist',
            isActive: true,
          };
        }
        return undefined;
      },
    });

    await app.ready();
  });

  afterEach(async () => {
    connectionManager.destroy();
    await app.close();
  });

  describe('/ws/guest Endpoint', () => {
    it('rejects unauthenticated WebSocket upgrade handshake with HTTP 401 when no token is provided', async () => {
      await expect(app.injectWS('/ws/guest')).rejects.toThrow('Unexpected server response: 401');
      expect(connectionManager.getActiveConnectionCount()).toBe(0);
    });

    it('rejects WebSocket upgrade handshake with HTTP 401 when token is invalid or malformed', async () => {
      await expect(app.injectWS('/ws/guest?token=invalid-garbage-token')).rejects.toThrow(
        'Unexpected server response: 401'
      );
      expect(connectionManager.getActiveConnectionCount()).toBe(0);
    });

    it('successfully upgrades and registers guest session via query parameter token', async () => {
      const token = createMockGuestToken({
        sessionId: 'sess-42',
        hotelId: 'hotel-luxury',
        roomId: 'room-500',
        roomNumber: '500',
        stayId: 'stay-99',
      });

      const ws: WebSocket = await app.injectWS(`/ws/guest?token=${token}`);

      const firstMessagePromise = new Promise<string>((resolve) => {
        ws.once('message', (data) => resolve(data.toString()));
      });

      const raw = await firstMessagePromise;
      const message = JSON.parse(raw);

      expect(message).toMatchObject({
        type: 'GUEST_CONNECTED',
        payload: {
          sessionId: 'sess-42',
          roomNumber: '500',
        },
      });

      expect(connectionManager.getActiveConnectionCount()).toBe(1);
      expect(connectionManager.getSocketsByChannel('guest:sess-42')).toHaveLength(1);
      expect(connectionManager.getSocketsByChannel('hotel:hotel-luxury')).toHaveLength(1);
      expect(connectionManager.getSocketsByChannel('stay:stay-99')).toHaveLength(1);

      // Clean unregister on client disconnect
      ws.terminate();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(connectionManager.getActiveConnectionCount()).toBe(0);
    });

    it('successfully upgrades and registers guest session via Authorization header', async () => {
      const token = createMockGuestToken({
        sessionId: 'sess-header',
        hotelId: 'hotel-header',
        roomId: 'room-102',
        roomNumber: '102',
        stayId: 'stay-102',
      });

      const ws: WebSocket = await app.injectWS('/ws/guest', {
        headers: { authorization: `Bearer ${token}` },
      });

      const firstMessagePromise = new Promise<string>((resolve) => {
        ws.once('message', (data) => resolve(data.toString()));
      });

      const raw = await firstMessagePromise;
      const message = JSON.parse(raw);

      expect(message).toMatchObject({
        type: 'GUEST_CONNECTED',
        payload: {
          sessionId: 'sess-header',
          roomNumber: '102',
        },
      });

      expect(connectionManager.getSocketsByChannel('guest:sess-header')).toHaveLength(1);
      ws.terminate();
    });
  });

  describe('/ws/staff Endpoint', () => {
    it('rejects unauthenticated WebSocket upgrade handshake with HTTP 401 when no token is provided', async () => {
      await expect(app.injectWS('/ws/staff')).rejects.toThrow('Unexpected server response: 401');
      expect(connectionManager.getActiveConnectionCount()).toBe(0);
    });

    it('closes socket with 4401 UNAUTHORIZED_CLOSE_CODE when access token is invalid', async () => {
      const ws: WebSocket = await app.injectWS('/ws/staff?accessToken=invalid-token');

      const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
        ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
      });

      const { code } = await closePromise;
      expect(code).toBe(UNAUTHORIZED_CLOSE_CODE);
      expect(connectionManager.getActiveConnectionCount()).toBe(0);
    });

    it('successfully upgrades and registers staff connection with valid access token', async () => {
      const ws: WebSocket = await app.injectWS('/ws/staff?accessToken=valid-staff-jwt');

      const firstMessagePromise = new Promise<string>((resolve) => {
        ws.once('message', (data) => resolve(data.toString()));
      });

      const raw = await firstMessagePromise;
      const message = JSON.parse(raw);

      expect(message).toMatchObject({
        type: 'STAFF_CONNECTED',
        payload: {
          userId: 'staff-1',
          hotelId: 'hotel-test',
        },
      });

      expect(connectionManager.getActiveConnectionCount()).toBe(1);
      expect(connectionManager.getSocketsByChannel('staff:staff-1')).toHaveLength(1);
      expect(connectionManager.getSocketsByChannel('hotel:hotel-test:staff')).toHaveLength(1);

      ws.terminate();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(connectionManager.getActiveConnectionCount()).toBe(0);
    });
  });

  describe('Ping/Pong Heartbeat and Lifecycle', () => {
    it('completes ping cycle and cleans up on terminate', async () => {
      const token = createMockGuestToken({
        sessionId: 'sess-hb',
        hotelId: 'hotel-hb',
        roomId: 'room-hb',
        roomNumber: '999',
        stayId: 'stay-hb',
      });

      const ws: WebSocket = await app.injectWS(`/ws/guest?token=${token}`);

      // First heartbeat sweep sends a ping frame
      connectionManager.checkHeartbeats();

      // Ensure socket is still registered and active
      expect(connectionManager.getActiveConnectionCount()).toBe(1);

      // Simulate client closing
      ws.terminate();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(connectionManager.getActiveConnectionCount()).toBe(0);
    });
  });

  describe('High-Volume Multi-Client Concurrency (50 Clients)', () => {
    it('registers and cleanly maintains 50 concurrent simulated client connections', async () => {
      const clientCount = 50;
      const connectedSockets: WebSocket[] = [];

      try {
        for (let index = 1; index <= clientCount; index++) {
          const guestToken = createMockGuestToken({
            sessionId: `sess-concurrency-${index}`,
            hotelId: 'hotel-load-test',
            roomId: `room-c-${index}`,
            roomNumber: `${100 + index}`,
            stayId: `stay-c-${index}`,
          });

          const ws: WebSocket = await app.injectWS(`/ws/guest?token=${guestToken}`);
          connectedSockets.push(ws);
        }

        expect(connectionManager.getActiveConnectionCount()).toBe(clientCount);

        // Verify channel membership and heartbeat sweep across all 50 connections
        connectionManager.checkHeartbeats();
        expect(connectionManager.getActiveConnectionCount()).toBe(clientCount);

        // Broadcast to a specific room channel among the 50
        const targetRoomChannel = 'room:hotel-load-test:room-c-25';
        expect(connectionManager.getSocketsByChannel(targetRoomChannel)).toHaveLength(1);
      } finally {
        for (const ws of connectedSockets) {
          try {
            ws.terminate();
          } catch {
            // ignore
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(connectionManager.getActiveConnectionCount()).toBe(0);
    });
  });
});
