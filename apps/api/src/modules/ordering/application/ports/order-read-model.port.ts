/**
 * WHAT IT DOES:
 * Read-only query port defining contract for retrieving order projections and summaries.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Decouples query handlers from direct database tables and ORMs.
 * - Supports multi-tenant isolation via required `hotelId` parameters.
 * - Supports guest-stay isolation via `listByStay(hotelId, stayId)` and `getByStay(hotelId, stayId, orderId)`.
 * - Provides tailored read models for payments (`findPaymentFacts`), check-out billing (`summarizeStay`),
 *   and staff boards (`list`).
 */

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
  listByStay(hotelId: string, stayId: string): Promise<OrderResponse[]>;
  getByStay(hotelId: string, stayId: string, orderId: string): Promise<OrderResponse | undefined>;
}
