import type {
  GuestOrderStatusMessage,
  GuestSessionExpiredMessage,
  StaffItemAvailabilityChangedMessage,
  StaffNewOrderMessage,
  StaffOrderStatusChangedMessage,
  StaffPaymentRecordedMessage,
  StaffSessionRevokedMessage,
} from '@conciergeiq/contracts';
import type { EventBus } from '../../shared/events/event-bus.js';
import type { Clock } from '../../shared/utils/clock.js';
import type { ConnectionManager } from './connection-manager.js';
import type { EventReplayBuffer } from './event-replay-buffer.js';

export interface RealtimeEventDispatcherDeps {
  bus: EventBus;
  connectionManager: ConnectionManager;
  replayBuffer: EventReplayBuffer;
  clock?: Clock;
}

/**
 * RealtimeEventDispatcher listens to domain events on the application EventBus
 * and dispatches strongly-typed, tenant-isolated real-time messages to authorized
 * WebSocket channels.
 *
 * It manages:
 * - Broadcasting new orders and order status changes to hotel staff dashboards.
 * - Routing order progression events strictly to the associated guest room channel.
 * - Buffering events for reconnection recovery via `Last-Event-ID`.
 * - Forcibly disconnecting active guest sockets upon guest check-out.
 */
export class RealtimeEventDispatcher {
  constructor(private readonly deps: RealtimeEventDispatcherDeps) {}

  start(): void {
    const { bus, connectionManager, replayBuffer } = this.deps;

    // 1. Subscribe to order.created -> broadcast to staff
    bus.subscribe('order.created', (event, deliveryContext) => {
      const staffChannel = `hotel:${event.hotelId}:staff`;
      const staffMessage: StaffNewOrderMessage = {
        type: 'NEW_ORDER_RECEIVED',
        payload: {
          orderId: event.orderId,
          orderNumber: event.orderNumber,
          roomNumber: event.roomNumber,
          totalAmount: event.totalAmount,
          itemsSummary: event.items
            .map((item) => (item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name))
            .join(' · '),
          createdAt: event.occurredAt,
        },
      };

      replayBuffer.record({
        channel: staffChannel,
        eventId: deliveryContext?.eventId,
        eventName: event.eventName,
        hotelId: event.hotelId,
        roomId: event.roomId,
        data: staffMessage,
        timestamp: event.occurredAt,
      });

      connectionManager.broadcast(staffChannel, staffMessage);
    });

    // 2. Subscribe to order.status_changed -> broadcast to staff AND guest room
    bus.subscribe('order.status_changed', (event, deliveryContext) => {
      // 2a. Broadcast to staff
      const staffChannel = `hotel:${event.hotelId}:staff`;
      const staffMessage: StaffOrderStatusChangedMessage = {
        type: 'ORDER_STATUS_CHANGED',
        payload: {
          orderId: event.orderId,
          orderNumber: event.orderNumber,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          changedBy: event.actor.type === 'staff' ? event.actor.name : undefined,
          updatedAt: event.occurredAt,
        },
      };

      replayBuffer.record({
        channel: staffChannel,
        eventId: deliveryContext?.eventId ? `${deliveryContext.eventId}-staff` : undefined,
        eventName: event.eventName,
        hotelId: event.hotelId,
        roomId: event.roomId,
        data: staffMessage,
        timestamp: event.occurredAt,
      });

      connectionManager.broadcast(staffChannel, staffMessage);

      // 2b. Broadcast to guest room channel: room:{hotelId}:{roomId}
      const roomChannel = `room:${event.hotelId}:${event.roomId}`;
      const guestMessage: GuestOrderStatusMessage = {
        type: 'ORDER_STATUS_UPDATED',
        payload: {
          orderId: event.orderId,
          status: event.newStatus,
          updatedAt: event.occurredAt,
        },
      };

      const guestRecorded = replayBuffer.record({
        channel: roomChannel,
        eventId: deliveryContext?.eventId ? `${deliveryContext.eventId}-guest` : undefined,
        eventName: event.eventName,
        hotelId: event.hotelId,
        roomId: event.roomId,
        data: guestMessage,
        timestamp: event.occurredAt,
      });

      connectionManager.broadcast(roomChannel, { ...guestMessage, eventId: guestRecorded.eventId });
    });

    // 3. Listen for stay.checked_out -> forcibly close all guest sockets in that room
    bus.subscribe('stay.checked_out', (event) => {
      const roomChannel = `room:${event.hotelId}:${event.roomId}`;
      const sockets = connectionManager.getSocketsByChannel(roomChannel);

      for (const socket of sockets) {
        const metadata = connectionManager.getMetadata(socket);
        if (metadata?.clientType === 'guest') {
          const expiredMessage: GuestSessionExpiredMessage = {
            type: 'SESSION_EXPIRED',
            payload: { reason: 'Stay has checked out' },
          };

          try {
            socket.send(JSON.stringify(expiredMessage));
            socket.close(4003, 'Stay checked out');
          } catch {
            // ignore
          }
          connectionManager.unregister(socket);
        }
      }
    });

    // 4. Payment recorded -> staff broadcast
    bus.subscribe('payment.recorded', (event, deliveryContext) => {
      const staffChannel = `hotel:${event.hotelId}:staff`;
      const staffMessage: StaffPaymentRecordedMessage = {
        type: 'PAYMENT_RECORDED',
        payload: {
          orderId: event.orderId,
          orderNumber: event.orderNumber,
          amount: event.amount,
          method: event.method,
          recordedAt: event.occurredAt,
        },
      };

      replayBuffer.record({
        channel: staffChannel,
        eventId: deliveryContext?.eventId,
        eventName: event.eventName,
        hotelId: event.hotelId,
        data: staffMessage,
        timestamp: event.occurredAt,
      });

      connectionManager.broadcast(staffChannel, staffMessage);
    });

    // 5. Item availability changed -> staff broadcast
    bus.subscribe('item.availability_changed', (event) => {
      const staffChannel = `hotel:${event.hotelId}:staff`;
      const staffMessage: StaffItemAvailabilityChangedMessage = {
        type: 'ITEM_AVAILABILITY_CHANGED',
        payload: {
          itemId: event.itemId,
          itemName: event.itemName,
          isAvailable: event.isAvailable,
        },
      };

      connectionManager.broadcast(staffChannel, staffMessage);
    });

    // 6. User deactivated -> revoke staff dashboards
    bus.subscribe('user.deactivated', (event) => {
      const sockets = connectionManager
        .getSocketsByChannel(`staff:${event.userId}`)
        .filter((s) => connectionManager.getMetadata(s)?.hotelId === event.hotelId);

      const message: StaffSessionRevokedMessage = {
        type: 'SESSION_REVOKED',
        payload: { reason: 'deactivated' },
      };

      for (const socket of sockets) {
        try {
          socket.send(JSON.stringify(message));
          socket.close(4001, 'Account deactivated');
        } catch {
          // ignore
        }
        connectionManager.unregister(socket);
      }
    });
  }
}
