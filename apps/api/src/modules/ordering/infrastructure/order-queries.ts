import { and, asc, desc, eq, gte, inArray, isNull, ne } from 'drizzle-orm';
import { OrderStatus, type OrderResponse, type PaymentMethod } from '@conciergeiq/contracts';
import type { DbExecutor } from '../../../shared/db/client.js';
import type {
  OrderPaymentFacts,
  OrderReadModel,
  StayOrdersSummary,
} from '../application/ports/order-read-model.port.js';
import { toMajorUnits } from '../../../shared/domain/money.js';
import { orderItems, orders, orderStatusLog, type OrderItemRow, type OrderRow, type OrderStatusLogRow } from './orders.schema.js';

const OPEN_STATUSES: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.IN_PROGRESS];

/** "Jollof rice ×2 · Chapman" */
function summarizeItems(items: OrderItemRow[]): string {
  return items.map((item) => (item.quantity > 1 ? `${item.itemName} ×${item.quantity}` : item.itemName)).join(' · ');
}

/** Read-only queries for screens. Writes go through the Order aggregate instead. */
export class OrderQueries implements OrderReadModel {
  constructor(private readonly db: DbExecutor) {}

  async list(hotelId: string, filter: { status?: OrderStatus; since: Date }): Promise<OrderResponse[]> {
    const conditions = [eq(orders.hotelId, hotelId), gte(orders.createdAt, filter.since)];
    if (filter.status) conditions.push(eq(orders.status, filter.status));

    const rows = await this.db
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt));
    return this.toResponses(rows);
  }

  async get(hotelId: string, orderId: string): Promise<OrderResponse | undefined> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.hotelId, hotelId), eq(orders.id, orderId)));
    const [order] = await this.toResponses(rows);
    return order;
  }

  async findPaymentFacts(hotelId: string, orderId: string): Promise<OrderPaymentFacts | undefined> {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.hotelId, hotelId), eq(orders.id, orderId)));
    return row && toPaymentFacts(row);
  }

  /** Delivered orders with a price that nobody has recorded a payment for yet. */
  async listDeliveredUnpaid(hotelId: string): Promise<OrderPaymentFacts[]> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.hotelId, hotelId),
          eq(orders.status, OrderStatus.DELIVERED),
          isNull(orders.paidAt),
          ne(orders.totalMinor, 0),
        ),
      )
      .orderBy(asc(orders.createdAt));
    return rows.map(toPaymentFacts);
  }

  async summarizeStay(hotelId: string, stayId: string): Promise<StayOrdersSummary> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.hotelId, hotelId), eq(orders.stayId, stayId)))
      .orderBy(asc(orders.createdAt));
    const charged = rows.filter((order) => order.status !== OrderStatus.CANCELLED);
    const open = rows.filter((order) => OPEN_STATUSES.includes(order.status));
    const items = await this.itemsByOrder(open.map((order) => order.id));

    return {
      ordersCount: rows.length,
      totalChargedMinor: sum(charged.map((order) => order.totalMinor)),
      totalPaidMinor: sum(charged.filter((order) => order.paidAt).map((order) => order.totalMinor)),
      openOrders: open.map((order) => ({
        orderId: order.id,
        orderNumber: order.number,
        status: order.status,
        itemsSummary: summarizeItems(items.get(order.id) ?? []),
      })),
    };
  }

  private async toResponses(rows: OrderRow[]): Promise<OrderResponse[]> {
    const orderIds = rows.map((row) => row.id);
    const [items, history] = await Promise.all([this.itemsByOrder(orderIds), this.historyByOrder(orderIds)]);

    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      roomId: row.roomId,
      roomNumber: row.roomNumber,
      stayId: row.stayId,
      status: row.status,
      items: (items.get(row.id) ?? []).map((item) => ({
        itemId: item.itemId,
        name: item.itemName,
        quantity: item.quantity,
        unitPrice: toMajorUnits(item.unitPriceMinor),
        notes: item.note ?? undefined,
      })),
      totalAmount: toMajorUnits(row.totalMinor),
      cancelReason: row.cancelReason,
      payment: row.paidAt && row.paymentMethod ? { method: row.paymentMethod, paidAt: row.paidAt.toISOString() } : null,
      history: (history.get(row.id) ?? []).map((entry) => ({
        from: entry.fromStatus,
        to: entry.toStatus,
        changedBy: entry.changedByName,
        changedAt: entry.changedAt.toISOString(),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  private async itemsByOrder(orderIds: string[]): Promise<Map<string, OrderItemRow[]>> {
    if (orderIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds))
      .orderBy(asc(orderItems.position));
    return groupBy(rows, (row) => row.orderId);
  }

  private async historyByOrder(orderIds: string[]): Promise<Map<string, OrderStatusLogRow[]>> {
    if (orderIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(orderStatusLog)
      .where(inArray(orderStatusLog.orderId, orderIds))
      .orderBy(asc(orderStatusLog.changedAt));
    return groupBy(rows, (row) => row.orderId);
  }
}

/** Mirrors a payment recorded by the payments module. Safe to run twice. */
export async function markOrderPaid(
  db: DbExecutor,
  payment: { hotelId: string; orderId: string; method: PaymentMethod; paidAt: Date },
): Promise<void> {
  await db
    .update(orders)
    .set({ paymentMethod: payment.method, paidAt: payment.paidAt })
    .where(and(eq(orders.hotelId, payment.hotelId), eq(orders.id, payment.orderId), isNull(orders.paidAt)));
}

function toPaymentFacts(row: OrderRow): OrderPaymentFacts {
  return {
    id: row.id,
    number: row.number,
    roomNumber: row.roomNumber,
    status: row.status,
    totalMinor: row.totalMinor,
    isPaid: row.paidAt !== null,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}
