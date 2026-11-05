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

/** An order nobody has accepted yet, as the escalations module sees it. */
export interface WaitingOrder {
  id: string;
  number: number;
  roomNumber: string;
  itemsSummary: string;
  createdAt: Date;
}

/** When (and whether) an order was accepted, for the escalation history. */
export interface OrderAcceptance {
  orderId: string;
  status: OrderStatus;
  acceptedAt: Date | null;
}

/** Read-only views of orders for screens and other modules. */
export interface OrderReadModel {
  list(hotelId: string, filter: { status?: OrderStatus; since: Date }): Promise<OrderResponse[]>;
  get(hotelId: string, orderId: string): Promise<OrderResponse | undefined>;
  findPaymentFacts(hotelId: string, orderId: string): Promise<OrderPaymentFacts | undefined>;
  listDeliveredUnpaid(hotelId: string): Promise<OrderPaymentFacts[]>;
  summarizeStay(hotelId: string, stayId: string): Promise<StayOrdersSummary>;
  /** Pending orders placed in the window `[placedAfter, placedBefore]`, oldest first. */
  listWaiting(hotelId: string, window: { placedBefore: Date; placedAfter: Date }): Promise<WaitingOrder[]>;
  acceptanceOf(hotelId: string, orderIds: string[]): Promise<OrderAcceptance[]>;
}
