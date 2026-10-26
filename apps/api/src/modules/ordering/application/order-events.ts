import type { EventActor, OrderStatusChangedEvent } from '@conciergeiq/contracts';
import type { Order, StatusChange } from '../domain/order.aggregate.js';

export function orderStatusChanged(
  order: Order,
  change: StatusChange,
  actor: EventActor,
  occurredAt: Date,
  reason?: string,
): OrderStatusChangedEvent {
  return {
    eventName: 'order.status_changed',
    hotelId: order.hotelId,
    occurredAt: occurredAt.toISOString(),
    actor,
    orderId: order.id,
    orderNumber: order.number,
    roomId: order.roomId,
    roomNumber: order.roomNumber,
    previousStatus: change.from,
    newStatus: change.to,
    reason,
  };
}
