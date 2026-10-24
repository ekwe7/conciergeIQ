import type { DomainEvent, StaffWSMessage } from '@conciergeiq/contracts';

/** What the staff dashboard should hear about an event, if anything. */
export function staffMessageForEvent(event: DomainEvent): StaffWSMessage | undefined {
  switch (event.eventName) {
    case 'order.created':
      return {
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
    case 'order.status_changed':
      return {
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
    case 'payment.recorded':
      return {
        type: 'PAYMENT_RECORDED',
        payload: {
          orderId: event.orderId,
          orderNumber: event.orderNumber,
          amount: event.amount,
          method: event.method,
          recordedAt: event.occurredAt,
        },
      };
    case 'item.availability_changed':
      return {
        type: 'ITEM_AVAILABILITY_CHANGED',
        payload: { itemId: event.itemId, itemName: event.itemName, isAvailable: event.isAvailable },
      };
    default:
      return undefined;
  }
}
