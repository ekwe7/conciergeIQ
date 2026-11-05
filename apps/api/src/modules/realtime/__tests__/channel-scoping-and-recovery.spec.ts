import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { StaffRole, type GuestWSMessage, type StaffWSMessage } from '@conciergeiq/contracts';
import type WebSocket from 'ws';
import { EventBus } from '../../../shared/events/event-bus.js';
import { systemClock } from '../../../shared/utils/clock.js';
import { ChannelAuthorizer } from '../channel-authorizer.js';
import { ConnectionManager } from '../connection-manager.js';
import { EventReplayBuffer } from '../event-replay-buffer.js';
import { RealtimeEventDispatcher } from '../realtime-event-dispatcher.js';
import { realtimeWebSocketPlugin } from '../websocket.plugin.js';
import { registerGuestGateway } from '../interface/guest-gateway.js';
import { registerStaffGateway } from '../interface/staff-gateway.js';
import { StaffConnections } from '../application/staff-connections.js';

function createGuestToken(claims: {
  sessionId: string;
  hotelId: string;
  roomId: string;
  roomNumber: string;
  stayId: string;
  guestName?: string;
}) {
  const data = {
    ...claims,
    type: 'guest',
  };
  return 'guest.' + Buffer.from(JSON.stringify(data)).toString('base64url');
}

class TestClient {
  readonly messages: (GuestWSMessage | StaffWSMessage | { type: string; [key: string]: unknown })[] = [];
  closeCode?: number;
  closeReason?: string;

  private constructor(public readonly ws: WebSocket) {
    ws.on('message', (data) => {
      try {
        this.messages.push(JSON.parse(data.toString()));
      } catch {
        // ignore
      }
    });
    ws.on('close', (code, reason) => {
      this.closeCode = code;
      this.closeReason = reason.toString();
    });
  }

  static async connect(app: FastifyInstance, url: string): Promise<TestClient> {
    const ws = await app.injectWS(url);
    const client = new TestClient(ws);
    await client.waitFor(() => client.messages.length > 0 || client.closeCode !== undefined);
    return client;
  }

  async waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() > deadline) {
        throw new Error('Timed out waiting for expected message or close event');
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  messagesOfType<T extends string>(type: T) {
    return this.messages.filter((m) => m.type === type);
  }

  close(): void {
    this.ws.terminate();
  }
}

describe('Real-Time Channel Scoping & Reconnection Recovery', () => {
  describe('ChannelAuthorizer Unit Tests', () => {
    const authorizer = new ChannelAuthorizer();

    it('allows guest to subscribe only to their own room, stay, and session channels', () => {
      const guest = {
        clientType: 'guest' as const,
        hotelId: 'hotel-a',
        roomId: 'room-101',
        roomNumber: '101',
        stayId: 'stay-1',
        sessionId: 'sess-1',
      };

      // Allowed
      expect(authorizer.authorize(guest, 'room:hotel-a:room-101')).toBe(true);
      expect(authorizer.authorize(guest, 'room:room-101')).toBe(true);
      expect(authorizer.authorize(guest, 'stay:stay-1')).toBe(true);
      expect(authorizer.authorize(guest, 'guest:sess-1')).toBe(true);
      expect(authorizer.authorize(guest, 'session:sess-1')).toBe(true);
      expect(authorizer.authorize(guest, 'hotel:hotel-a:guests')).toBe(true);

      // Forbidden: other rooms
      expect(authorizer.authorize(guest, 'room:hotel-a:room-102')).toBe(false);
      expect(authorizer.authorize(guest, 'room:hotel-b:room-101')).toBe(false);
      expect(authorizer.authorize(guest, 'stay:stay-2')).toBe(false);

      // Forbidden: staff channels
      expect(authorizer.authorize(guest, 'hotel:hotel-a:staff')).toBe(false);
      expect(authorizer.authorize(guest, 'staff:staff-1')).toBe(false);
    });

    it('allows staff to subscribe only to channels within their hotel tenant', () => {
      const staff = {
        clientType: 'staff' as const,
        hotelId: 'hotel-a',
        userId: 'user-a',
        role: 'receptionist',
      };

      // Allowed in Hotel A
      expect(authorizer.authorize(staff, 'hotel:hotel-a:staff')).toBe(true);
      expect(authorizer.authorize(staff, 'hotel:hotel-a')).toBe(true);
      expect(authorizer.authorize(staff, 'staff:user-a')).toBe(true);
      expect(authorizer.authorize(staff, 'room:hotel-a:room-101')).toBe(true);

      // Forbidden in Hotel B
      expect(authorizer.authorize(staff, 'hotel:hotel-b:staff')).toBe(false);
      expect(authorizer.authorize(staff, 'hotel:hotel-b')).toBe(false);
      expect(authorizer.authorize(staff, 'room:hotel-b:room-101')).toBe(false);
      expect(authorizer.authorize(staff, 'staff:user-b')).toBe(false);
    });
  });

  describe('EventReplayBuffer Unit Tests', () => {
    it('buffers events and replays missed updates in chronological order', () => {
      const buffer = new EventReplayBuffer();
      const channel = 'room:hotel-a:room-101';

      const evt1 = buffer.record({
        channel,
        eventName: 'order.status_changed',
        hotelId: 'hotel-a',
        roomId: 'room-101',
        data: { status: 'PENDING' },
      });

      const evt2 = buffer.record({
        channel,
        eventName: 'order.status_changed',
        hotelId: 'hotel-a',
        roomId: 'room-101',
        data: { status: 'IN_PROGRESS' },
      });

      const evt3 = buffer.record({
        channel,
        eventName: 'order.status_changed',
        hotelId: 'hotel-a',
        roomId: 'room-101',
        data: { status: 'DELIVERED' },
      });

      // Missed since evt1
      const missedSince1 = buffer.getMissedEvents(channel, evt1.eventId);
      expect(missedSince1).toHaveLength(2);
      expect(missedSince1[0]?.data).toEqual({ status: 'IN_PROGRESS' });
      expect(missedSince1[1]?.data).toEqual({ status: 'DELIVERED' });

      // Missed since evt2
      const missedSince2 = buffer.getMissedEvents(channel, evt2.eventId);
      expect(missedSince2).toHaveLength(1);
      expect(missedSince2[0]?.data).toEqual({ status: 'DELIVERED' });

      // Client already up to date with evt3
      const upToDate = buffer.getMissedEvents(channel, evt3.eventId);
      expect(upToDate).toHaveLength(0);
    });

    it('isolates buffered events by channel', () => {
      const buffer = new EventReplayBuffer();

      buffer.record({
        channel: 'room:hotel-a:room-101',
        eventName: 'order.status_changed',
        hotelId: 'hotel-a',
        data: { orderId: 'ord-1' },
      });

      buffer.record({
        channel: 'room:hotel-a:room-102',
        eventName: 'order.status_changed',
        hotelId: 'hotel-a',
        data: { orderId: 'ord-2' },
      });

      const room101Events = buffer.getMissedEvents('room:hotel-a:room-101', '');
      expect(room101Events).toHaveLength(1);
      expect(room101Events[0]?.data).toEqual({ orderId: 'ord-1' });

      const room102Events = buffer.getMissedEvents('room:hotel-a:room-102', '');
      expect(room102Events).toHaveLength(1);
      expect(room102Events[0]?.data).toEqual({ orderId: 'ord-2' });
    });
  });

  describe('Multi-Client Multi-Tenant Integration Tests', () => {
    let app: FastifyInstance;
    let bus: EventBus;
    let connectionManager: ConnectionManager;
    let channelAuthorizer: ChannelAuthorizer;
    let replayBuffer: EventReplayBuffer;
    let dispatcher: RealtimeEventDispatcher;
    let staffConnections: StaffConnections;

    beforeEach(async () => {
      app = Fastify();
      await app.register(fastifyJwt, { secret: 'super-secret-key-that-is-at-least-32-chars!' });

      bus = new EventBus();
      connectionManager = new ConnectionManager();
      channelAuthorizer = new ChannelAuthorizer();
      replayBuffer = new EventReplayBuffer();
      staffConnections = new StaffConnections(connectionManager);

      dispatcher = new RealtimeEventDispatcher({
        bus,
        connectionManager,
        replayBuffer,
        clock: systemClock,
      });
      dispatcher.start();

      await app.register(realtimeWebSocketPlugin, { connectionManager });

      registerGuestGateway(app, {
        connectionManager,
        clock: systemClock,
        channelAuthorizer,
        replayBuffer,
      });

      registerStaffGateway(app, {
        connections: staffConnections,
        clock: systemClock,
        channelAuthorizer,
        replayBuffer,
        staffFromAccessToken: async (token) => {
          if (token === 'staff-token-hotel-a') {
            return {
              id: 'staff-a',
              hotelId: 'hotel-a',
              fullName: 'Alice Staff',
              role: StaffRole.RECEPTIONIST,
              isActive: true,
            };
          }
          if (token === 'staff-token-hotel-b') {
            return {
              id: 'staff-b',
              hotelId: 'hotel-b',
              fullName: 'Bob Staff',
              role: StaffRole.RECEPTIONIST,
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

    it('enforces multi-client and multi-tenant isolation across concurrent guest and staff sockets', async () => {
      // 1. Connect Staff A (Hotel A) and Staff B (Hotel B)
      const staffA = await TestClient.connect(app, '/ws/staff?accessToken=staff-token-hotel-a');
      const staffB = await TestClient.connect(app, '/ws/staff?accessToken=staff-token-hotel-b');

      // 2. Connect Guest A1 (Hotel A, Room 101) and Guest A2 (Hotel A, Room 102)
      const tokenA1 = createGuestToken({
        sessionId: 'sess-a1',
        hotelId: 'hotel-a',
        roomId: 'room-101',
        roomNumber: '101',
        stayId: 'stay-a1',
      });
      const tokenA2 = createGuestToken({
        sessionId: 'sess-a2',
        hotelId: 'hotel-a',
        roomId: 'room-102',
        roomNumber: '102',
        stayId: 'stay-a2',
      });
      const guestA1 = await TestClient.connect(app, `/ws/guest?token=${tokenA1}`);
      const guestA2 = await TestClient.connect(app, `/ws/guest?token=${tokenA2}`);

      // 3. Connect Guest B1 (Hotel B, Room 201)
      const tokenB1 = createGuestToken({
        sessionId: 'sess-b1',
        hotelId: 'hotel-b',
        roomId: 'room-201',
        roomNumber: '201',
        stayId: 'stay-b1',
      });
      const guestB1 = await TestClient.connect(app, `/ws/guest?token=${tokenB1}`);

      // All connections received their greetings
      expect(staffA.messages[0]).toMatchObject({ type: 'STAFF_CONNECTED' });
      expect(staffB.messages[0]).toMatchObject({ type: 'STAFF_CONNECTED' });
      expect(guestA1.messages[0]).toMatchObject({ type: 'GUEST_CONNECTED' });
      expect(guestA2.messages[0]).toMatchObject({ type: 'GUEST_CONNECTED' });
      expect(guestB1.messages[0]).toMatchObject({ type: 'GUEST_CONNECTED' });

      // 4. Trigger order.created for Hotel A, Room 101
      bus.publish(
        {
          eventName: 'order.created',
          hotelId: 'hotel-a',
          orderId: 'ord-101',
          orderNumber: 1,
          roomId: 'room-101',
          roomNumber: '101',
          items: [{ itemId: 'item-1', name: 'Jollof Rice', quantity: 1, unitPrice: 5000 }],
          totalAmount: 5000,
          status: 'PENDING',
          actor: { type: 'guest', roomNumber: '101' },
          occurredAt: new Date().toISOString(),
        },
        { eventId: 'evt-order-1' }
      );

      await staffA.waitFor(() => staffA.messagesOfType('NEW_ORDER_RECEIVED').length > 0);

      // Staff A received the new order
      expect(staffA.messagesOfType('NEW_ORDER_RECEIVED')).toHaveLength(1);

      // Staff B (Hotel B) did NOT receive the order from Hotel A
      expect(staffB.messagesOfType('NEW_ORDER_RECEIVED')).toHaveLength(0);

      // Guests do not receive order.created (staff-only notification)
      expect(guestA1.messagesOfType('NEW_ORDER_RECEIVED')).toHaveLength(0);
      expect(guestA2.messagesOfType('NEW_ORDER_RECEIVED')).toHaveLength(0);

      // 5. Trigger order.status_changed for Hotel A, Room 101 -> IN_PROGRESS
      bus.publish(
        {
          eventName: 'order.status_changed',
          hotelId: 'hotel-a',
          orderId: 'ord-101',
          orderNumber: 1,
          roomId: 'room-101',
          roomNumber: '101',
          previousStatus: 'PENDING',
          newStatus: 'IN_PROGRESS',
          actor: { type: 'staff', id: 'staff-a', name: 'Alice Staff' },
          occurredAt: new Date().toISOString(),
        },
        { eventId: 'evt-status-1' }
      );

      await guestA1.waitFor(() => guestA1.messagesOfType('ORDER_STATUS_UPDATED').length > 0);
      await staffA.waitFor(() => staffA.messagesOfType('ORDER_STATUS_CHANGED').length > 0);

      // Staff A received status change
      expect(staffA.messagesOfType('ORDER_STATUS_CHANGED')).toHaveLength(1);

      // Guest A1 (Room 101) received status change
      expect(guestA1.messagesOfType('ORDER_STATUS_UPDATED')).toEqual([
        expect.objectContaining({
          type: 'ORDER_STATUS_UPDATED',
          payload: expect.objectContaining({ orderId: 'ord-101', status: 'IN_PROGRESS' }),
        }),
      ]);

      // Guest A2 (Room 102) did NOT receive Room 101's status update!
      expect(guestA2.messagesOfType('ORDER_STATUS_UPDATED')).toHaveLength(0);

      // Hotel B clients received NOTHING from Hotel A
      expect(staffB.messagesOfType('ORDER_STATUS_CHANGED')).toHaveLength(0);
      expect(guestB1.messagesOfType('ORDER_STATUS_UPDATED')).toHaveLength(0);

      // Cleanup
      staffA.close();
      staffB.close();
      guestA1.close();
      guestA2.close();
      guestB1.close();
    });

    it('replays missed events in chronological order when client reconnects with Last-Event-ID', async () => {
      const token = createGuestToken({
        sessionId: 'sess-recovery',
        hotelId: 'hotel-a',
        roomId: 'room-recovery',
        roomNumber: '303',
        stayId: 'stay-recovery',
      });

      // 1. Initial connection
      const initialClient = await TestClient.connect(app, `/ws/guest?token=${token}`);

      // 2. Publish initial status update (IN_PROGRESS)
      bus.publish(
        {
          eventName: 'order.status_changed',
          hotelId: 'hotel-a',
          orderId: 'ord-recovery',
          orderNumber: 42,
          roomId: 'room-recovery',
          roomNumber: '303',
          previousStatus: 'PENDING',
          newStatus: 'IN_PROGRESS',
          actor: { type: 'staff', id: 'staff-a', name: 'Alice' },
          occurredAt: new Date().toISOString(),
        },
        { eventId: 'evt-rec-1' }
      );

      await initialClient.waitFor(() => initialClient.messagesOfType('ORDER_STATUS_UPDATED').length > 0);
      const firstMessage = initialClient.messagesOfType('ORDER_STATUS_UPDATED')[0] as {
        eventId?: string;
        payload: { status: string };
      };
      expect(firstMessage.payload.status).toBe('IN_PROGRESS');
      const lastEventId = firstMessage.eventId;
      expect(lastEventId).toBeDefined();

      // 3. Client disconnects (e.g. Wi-Fi drop)
      initialClient.close();

      // 4. While disconnected, order transitions to DELIVERED
      bus.publish(
        {
          eventName: 'order.status_changed',
          hotelId: 'hotel-a',
          orderId: 'ord-recovery',
          orderNumber: 42,
          roomId: 'room-recovery',
          roomNumber: '303',
          previousStatus: 'IN_PROGRESS',
          newStatus: 'DELIVERED',
          actor: { type: 'staff', id: 'staff-a', name: 'Alice' },
          occurredAt: new Date().toISOString(),
        },
        { eventId: 'evt-rec-2' }
      );

      // 5. Client reconnects supplying Last-Event-ID
      const reconnectedClient = await TestClient.connect(
        app,
        `/ws/guest?token=${token}&lastEventId=${encodeURIComponent(lastEventId!)}`
      );

      await reconnectedClient.waitFor(
        () => reconnectedClient.messagesOfType('ORDER_STATUS_UPDATED').length > 0
      );

      // Assert reconnected client received the missed DELIVERED event
      const missedUpdates = reconnectedClient.messagesOfType('ORDER_STATUS_UPDATED');
      expect(missedUpdates).toHaveLength(1);
      expect(missedUpdates[0]).toMatchObject({
        type: 'ORDER_STATUS_UPDATED',
        payload: { orderId: 'ord-recovery', status: 'DELIVERED' },
      });

      reconnectedClient.close();
    });

    it('forcibly disconnects guest socket and cleans up when stay is checked out', async () => {
      const token = createGuestToken({
        sessionId: 'sess-checkout',
        hotelId: 'hotel-a',
        roomId: 'room-checkout',
        roomNumber: '404',
        stayId: 'stay-checkout',
      });

      const client = await TestClient.connect(app, `/ws/guest?token=${token}`);
      expect(connectionManager.getActiveConnectionCount()).toBe(1);

      // Publish stay.checked_out
      bus.publish(
        {
          eventName: 'stay.checked_out',
          hotelId: 'hotel-a',
          stayId: 'stay-checkout',
          roomId: 'room-checkout',
          roomNumber: '404',
          guestName: 'Jane Doe',
          actor: { type: 'staff', id: 'staff-a', name: 'Alice' },
          occurredAt: new Date().toISOString(),
        },
        { eventId: 'evt-checkout' }
      );

      await client.waitFor(() => client.closeCode !== undefined);

      // Received SESSION_EXPIRED
      expect(client.messagesOfType('SESSION_EXPIRED')).toHaveLength(1);
      expect(client.closeCode).toBe(4003);

      // Purged from memory
      expect(connectionManager.getActiveConnectionCount()).toBe(0);
      expect(connectionManager.getSocketsByChannel('room:hotel-a:room-checkout')).toHaveLength(0);
    });

    it('rejects unauthorized dynamic channel subscription requests from client', async () => {
      const token = createGuestToken({
        sessionId: 'sess-sub',
        hotelId: 'hotel-a',
        roomId: 'room-101',
        roomNumber: '101',
        stayId: 'stay-sub',
      });

      const client = await TestClient.connect(app, `/ws/guest?token=${token}`);

      // Attempt to subscribe to forbidden staff channel
      client.ws.send(JSON.stringify({ type: 'SUBSCRIBE', channel: 'hotel:hotel-a:staff' }));

      await client.waitFor(() => client.messagesOfType('ERROR').length > 0);
      expect(client.messagesOfType('ERROR')[0]).toMatchObject({
        type: 'ERROR',
        error: 'Forbidden',
      });

      // Attempt to subscribe to authorized room channel
      client.ws.send(JSON.stringify({ type: 'SUBSCRIBE', channel: 'room:hotel-a:room-101' }));

      await client.waitFor(() => client.messagesOfType('SUBSCRIBED').length > 0);
      expect(client.messagesOfType('SUBSCRIBED')[0]).toMatchObject({
        type: 'SUBSCRIBED',
        channel: 'room:hotel-a:room-101',
      });

      client.close();
    });
  });
});
