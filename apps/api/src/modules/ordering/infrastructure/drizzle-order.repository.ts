import { and, asc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.js';
import type { OrderRepository, StatusChanger } from '../application/ports/order.repository.js';
import { Order, type StatusChange } from '../domain/order.aggregate.js';
import { orderItems, orders, orderStatusLog, type OrderRow } from './orders.schema.js';

export class DrizzleOrderRepository implements OrderRepository {
  constructor(private readonly db: DbExecutor) {}

  async nextOrderNumber(): Promise<number> {
    const [row] = await this.db.execute<{ value: string }>(sql`select nextval('ordering.order_number_seq') as value`);
    return Number(row!.value);
  }

  async findById(hotelId: string, orderId: string): Promise<Order | undefined> {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.hotelId, hotelId), eq(orders.id, orderId)));
    return row && this.restore(row);
  }

  async findByIdempotencyKey(hotelId: string, idempotencyKey: string): Promise<Order | undefined> {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.hotelId, hotelId), eq(orders.idempotencyKey, idempotencyKey)));
    return row && this.restore(row);
  }

  async insert(order: Order, placedBy: StatusChanger): Promise<void> {
    const props = order.toProps();
    await this.db.insert(orders).values({ ...props, totalMinor: order.totalMinor });
    await this.db.insert(orderItems).values(
      props.items.map((item, position) => ({
        orderId: order.id,
        position,
        itemId: item.itemId,
        itemName: item.name,
        unitPriceMinor: item.unitPriceMinor,
        quantity: item.quantity,
        note: item.notes,
      })),
    );
    await this.logStatus(order.id, { from: null, to: order.status }, placedBy, props.createdAt);
  }

  async saveStatusChange(order: Order, change: StatusChange, changedBy: StatusChanger): Promise<void> {
    const { status, cancelReason, updatedAt } = order.toProps();
    await this.db.update(orders).set({ status, cancelReason, updatedAt }).where(eq(orders.id, order.id));
    await this.logStatus(order.id, change, changedBy, updatedAt);
  }

  private async logStatus(
    orderId: string,
    change: { from: StatusChange['from'] | null; to: StatusChange['to'] },
    changedBy: StatusChanger,
    at: Date,
  ): Promise<void> {
    await this.db.insert(orderStatusLog).values({
      orderId,
      fromStatus: change.from,
      toStatus: change.to,
      changedByUserId: changedBy.userId,
      changedByName: changedBy.name,
      changedAt: at,
    });
  }

  private async restore(row: OrderRow): Promise<Order> {
    const items = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, row.id))
      .orderBy(asc(orderItems.position));

    return Order.restore({
      ...row,
      items: items.map((item) => ({
        itemId: item.itemId,
        name: item.itemName,
        unitPriceMinor: item.unitPriceMinor,
        quantity: item.quantity,
        notes: item.note ?? undefined,
      })),
    });
  }
}
