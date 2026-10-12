import type { OrderStatus } from '../order-status.js';

export interface OrderStatusChangedEvent {
  eventName: 'order.status_changed';
  orderId: string;
  hotelId: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  changedByUserId?: string;
  reason?: string;
  timestamp: string;
}
