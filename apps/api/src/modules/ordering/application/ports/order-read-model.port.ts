import type { OrderResponse, OrderStatus } from '@conciergeiq/contracts';

/** The facts the payments module needs before recording a payment. */
export interface OrderPaymentFacts {
  id: string;
  number: number;
  roomNumber: string;
  status: OrderStatus;
  totalMinor: number;
  isPaid: boolean;
}

/** What the check-out dialog needs to know about a stay's orders. */
export interface StayOrdersSummary {
  ordersCount: number;
  totalChargedMinor: number;
  totalPaidMinor: number;
  openOrders: { orderId: string; orderNumber: number; status: OrderStatus; itemsSummary: string }[];
}

/** Read-only views of orders for screens and other modules. */
export interface OrderReadModel {
  list(hotelId: string, filter: { status?: OrderStatus; since: Date }): Promise<OrderResponse[]>;
  get(hotelId: string, orderId: string): Promise<OrderResponse | undefined>;
  findPaymentFacts(hotelId: string, orderId: string): Promise<OrderPaymentFacts | undefined>;
  listDeliveredUnpaid(hotelId: string): Promise<OrderPaymentFacts[]>;
  summarizeStay(hotelId: string, stayId: string): Promise<StayOrdersSummary>;
}
