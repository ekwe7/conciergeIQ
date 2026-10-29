/**
 * WHAT IT DOES:
 * Drizzle ORM implementation of `OrderRepository` for PostgreSQL persistence.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Operates against either a standard database connection or an active transaction executor (`DbExecutor`).
 * - Supports `save(order, tx)` to persist orders inside atomic transaction contexts alongside outbox events.
 * - Restores `Order` aggregate roots with line items ordered by sequence position.
 * - Logs all status lifecycle movements into `ordering.order_status_log` for auditability.
 */

import { and, asc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.js';
import type { OrderRepository, StatusChanger } from '../application/ports/order.repository.js';
import { Order, type StatusChange } from '../domain/order.aggregate.js';
import { orderItems, orders, orderStatusLog, type OrderRow } from './orders.schema.js';

export class DrizzleOrderRepository implements OrderRepository {
  constructor(private readonly db: DbExecutor) {}

  public nextOrderNumber = async (): Promise<number> => {
    const [row] = await this.db.execute<{ value: string }>(
      sql`select nextval('ordering.order_number_seq') as value`
    );
    return Number(row!.value);
  };

  public findById = async (
    hotelId: string,
    orderId: string
  ): Promise<Order | undefined> => {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.hotelId, hotelId), eq(orders.id, orderId)));
    return row && this.restore(row);
  };

  public findByIdempotencyKey = async (
    hotelId: string,
    idempotencyKey: string
  ): Promise<Order | undefined> => {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(
        and(eq(orders.hotelId, hotelId), eq(orders.idempotencyKey, idempotencyKey))
      );
    return row && this.restore(row);
  };

  public save = async (
    order: Order,
    transactionContext?: unknown,
    placedBy?: StatusChanger
  ): Promise<void> => {
    const executor = (transactionContext as DbExecutor) ?? this.db;
    const orderProperties = order.toProps();

    const existingRows = await executor
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, order.id));

    if (existingRows.length === 0) {
      await executor.insert(orders).values({
        ...orderProperties,
        totalMinor: order.totalMinor,
      });

      if (orderProperties.items.length > 0) {
        await executor.insert(orderItems).values(
          orderProperties.items.map((item, position) => ({
            orderId: order.id,
            position,
            itemId: item.itemId,
            itemName: item.name,
            unitPriceMinor: item.unitPriceMinor,
            quantity: item.quantity,
            note: item.notes,
          }))
        );
      }

      await this.logStatusWithExecutor(
        executor,
        order.id,
        { from: null, to: order.status },
        placedBy ?? { userId: null, name: `Guest · Room ${order.roomNumber}` },
        orderProperties.createdAt
      );
    } else {
      await executor
        .update(orders)
        .set({
          status: orderProperties.status,
          cancelReason: orderProperties.cancelReason,
          updatedAt: orderProperties.updatedAt,
        })
        .where(eq(orders.id, order.id));
    }
  };

  public insert = async (
    order: Order,
    placedBy?: StatusChanger
  ): Promise<void> => {
    await this.save(order, this.db, placedBy);
  };

  public saveStatusChange = async (
    order: Order,
    change: StatusChange,
    changedBy: StatusChanger
  ): Promise<void> => {
    const { status, cancelReason, updatedAt } = order.toProps();
    await this.db
      .update(orders)
      .set({ status, cancelReason, updatedAt })
      .where(eq(orders.id, order.id));
    await this.logStatusWithExecutor(this.db, order.id, change, changedBy, updatedAt);
  };

  private logStatusWithExecutor = async (
    executor: DbExecutor,
    orderId: string,
    change: { from: StatusChange['from'] | null; to: StatusChange['to'] },
    changedBy: StatusChanger,
    at: Date
  ): Promise<void> => {
    await executor.insert(orderStatusLog).values({
      orderId,
      fromStatus: change.from,
      toStatus: change.to,
      changedByUserId: changedBy.userId,
      changedByName: changedBy.name,
      changedAt: at,
    });
  };

  private restore = async (row: OrderRow): Promise<Order> => {
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
  };
}
