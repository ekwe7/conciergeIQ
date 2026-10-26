import type { Database } from '../../../../shared/db/client.js';
import type { EventBus } from '../../../../shared/events/event-bus.js';
import { markOrderPaid } from '../../infrastructure/order-queries.js';

/** When the front desk records a payment, the order shows as paid on the board. */
export function subscribeToPayments(bus: EventBus, db: Database): void {
  bus.subscribe('payment.recorded', async (event) => {
    await markOrderPaid(db, {
      hotelId: event.hotelId,
      orderId: event.orderId,
      method: event.method,
      paidAt: new Date(event.occurredAt),
    });
  });
}
