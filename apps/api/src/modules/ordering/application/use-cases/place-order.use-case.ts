import { randomUUID } from 'node:crypto';
import type { OrderItemInput } from '@conciergeiq/contracts';
import { isUniqueViolation } from '../../../../shared/db/errors.js';
import type { Clock } from '../../../../shared/utils/clock.js';
import { toMajorUnits } from '../../../../shared/domain/money.js';
import { Order } from '../../domain/order.aggregate.js';
import { priceOrderItems } from '../order-pricing.service.js';
import type { MenuLookup } from '../ports/menu-lookup.port.js';
import type { OrderingUnitOfWork } from '../ports/ordering-unit-of-work.port.js';

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

  /**
   * Places the order, or returns the order already placed with the same
   * idempotency key. Phones on a weak signal retry sends whose reply was
   * lost, sometimes later and sometimes several at once: each gets the one
   * order back, even if the menu has changed since it was created.
   */
  async execute(command: PlaceOrderCommand): Promise<Order> {
    try {
      return await this.place(command);
    } catch (error) {
      // Two retries raced past the lookup; the unique key let only one in.
      if (command.idempotencyKey && isUniqueViolation(error)) {
        const winner = await this.findExisting(command.hotelId, command.idempotencyKey);
        if (winner) return winner;
      }
      throw error;
    }
  }

  private findExisting(hotelId: string, idempotencyKey: string): Promise<Order | undefined> {
    return this.unitOfWork.run(async ({ orders }) => (await orders.findByIdempotencyKey(hotelId, idempotencyKey)) ?? undefined);
  }

  private async place(command: PlaceOrderCommand): Promise<Order> {
    // A retry of an order already placed is answered before the menu is checked.
    if (command.idempotencyKey) {
      const existing = await this.findExisting(command.hotelId, command.idempotencyKey);
      if (existing) return existing;
    }

    const menuItems = await this.menu.findItems(
      command.hotelId,
      command.items.map((line) => line.itemId),
    );
    const items = priceOrderItems(command.items, menuItems);

    return this.unitOfWork.run(async ({ orders, recordEvent }) => {

      const placedAt = this.clock.now();
      const order = Order.place({
        id: randomUUID(),
        hotelId: command.hotelId,
        number: await orders.nextOrderNumber(),
        roomId: command.roomId,
        roomNumber: command.roomNumber,
        stayId: command.stayId,
        items,
        idempotencyKey: command.idempotencyKey ?? null,
        createdAt: placedAt,
      });

      await orders.insert(order, { userId: null, name: `Guest · Room ${order.roomNumber}` });
      await recordEvent({
        eventName: 'order.created',
        hotelId: order.hotelId,
        occurredAt: placedAt.toISOString(),
        actor: { type: 'guest', roomNumber: order.roomNumber },
        orderId: order.id,
        orderNumber: order.number,
        roomId: order.roomId,
        roomNumber: order.roomNumber,
        items: order.items.map((item) => ({
          itemId: item.itemId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: toMajorUnits(item.unitPriceMinor),
          notes: item.notes,
        })),
        totalAmount: toMajorUnits(order.totalMinor),
        status: 'PENDING',
      });
      return order;
    });
  }
}
