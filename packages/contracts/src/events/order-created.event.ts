import type { OrderStatus } from '../order-status.js';
import type { EventBase } from './event-base.js';

export interface OrderItem {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

export interface OrderCreatedEvent extends EventBase {
  eventName: 'order.created';
  orderId: string;
  orderNumber: number;
  roomId: string;
  roomNumber: string;
  items: OrderItem[];
  totalAmount: number;
  status: typeof OrderStatus.PENDING;
}
