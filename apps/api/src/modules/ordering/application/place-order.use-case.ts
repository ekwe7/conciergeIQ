/**
 * WHAT IT DOES:
 * Orchestrates guest in-room dining order placement within an atomic transactional unit of work.
 * Coordinates menu pricing verification, aggregate root creation, transactional order persistence,
 * and outbox event recording.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Atomic Delivery: Order persistence and outbox event writing happen inside the same database transaction
 *   to ensure zero ghost orders or lost notifications upon system failures.
 * - Server-Side Authoritative Pricing: Ignores client prices and resolves exact minor units from `MenuLookup`.
 * - Idempotency: Protects against double-taps or network retries via `idempotencyKey`. If an order with the same
 *   key already exists, returns the original order without duplicating writes or outbox events.
 * - Outbox Coordination: Emits typed `order.created` domain events through the transactional outbox pipeline.
 */

import { randomUUID } from 'node:crypto';
import type { DomainEvent, OrderItemInput } from '@conciergeiq/contracts';
import type { Clock } from '../../../shared/utils/clock.js';
import { toMajorUnits } from '../../../shared/domain/money.js';
import { Order } from '../domain/order.aggregate.js';
import { priceOrderItems } from './order-pricing.service.js';
import type { MenuLookup } from './ports/menu-lookup.port.js';
import type { OrderingUnitOfWork } from './ports/ordering-unit-of-work.port.js';

export interface PlaceOrderCommand {
  hotelId: string;
  roomId: string;
  roomNumber: string;
  stayId: string;
  items: OrderItemInput[];
  /** Sending the same key again returns the first order instead of creating another. */
  idempotencyKey?: string;
}

export class PlaceOrderUseCase {
  constructor(
    private readonly unitOfWork: OrderingUnitOfWork,
    private readonly menu: MenuLookup,
    private readonly clock: Clock,
  ) {}

  public execute = async (command: PlaceOrderCommand): Promise<Order> => {
    const menuItems = await this.menu.findItems(
      command.hotelId,
      command.items.map((line) => line.itemId),
    );
    const pricedItems = priceOrderItems(command.items, menuItems);

    return this.unitOfWork.run(async ({ orders, recordEvent }) => {
      if (command.idempotencyKey) {
        const existingOrder = await orders.findByIdempotencyKey(
          command.hotelId,
          command.idempotencyKey
        );
        if (existingOrder) {
          return existingOrder;
        }
      }

      const placedAt = this.clock.now();
      const nextNumber = await orders.nextOrderNumber();

      const createdOrder = Order.place({
        id: randomUUID(),
        hotelId: command.hotelId,
        number: nextNumber,
        roomId: command.roomId,
        roomNumber: command.roomNumber,
        stayId: command.stayId,
        items: pricedItems,
        idempotencyKey: command.idempotencyKey ?? null,
        createdAt: placedAt,
      });

      if (typeof orders.save === 'function') {
        await orders.save(createdOrder);
      } else {
        await orders.insert(createdOrder, {
          userId: null,
          name: `Guest · Room ${createdOrder.roomNumber}`,
        });
      }

      const domainEventsToStage = createdOrder.pullDomainEvents();
      if (domainEventsToStage.length > 0) {
        for (const domainEvent of domainEventsToStage) {
          await recordEvent(domainEvent as unknown as DomainEvent);
        }
      } else {
        await recordEvent({
          eventName: 'order.created',
          hotelId: createdOrder.hotelId,
          occurredAt: placedAt.toISOString(),
          actor: { type: 'guest', roomNumber: createdOrder.roomNumber },
          orderId: createdOrder.id,
          orderNumber: createdOrder.number,
          roomId: createdOrder.roomId,
          roomNumber: createdOrder.roomNumber,
          items: createdOrder.items.map((item) => ({
            itemId: item.itemId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: toMajorUnits(item.unitPriceMinor),
            notes: item.notes,
          })),
          totalAmount: toMajorUnits(createdOrder.totalMinor),
          status: 'PENDING',
        });
      }

      return createdOrder;
    });
  };
}
