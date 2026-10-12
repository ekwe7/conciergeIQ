import type { OrderStatus } from '../order-status.js';

export interface OrderItem {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

export interface OrderCreatedEvent {
  eventName: 'order.created';
  orderId: string;
  hotelId: string;
  roomId: string;
  roomNumber: string;
  guestId?: string;
  items: OrderItem[];
  totalAmount: number;
  status: typeof OrderStatus.PENDING;
  createdAt: string;
}
