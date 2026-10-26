import type { OrderStatus } from '../order-status.js';
import type { EventBase } from './event-base.js';

export interface OrderStatusChangedEvent extends EventBase {
  eventName: 'order.status_changed';
  orderId: string;
  orderNumber: number;
  roomId: string;
  roomNumber: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  reason?: string;
}
