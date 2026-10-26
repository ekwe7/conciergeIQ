import { randomUUID } from 'node:crypto';
import type { OrderItemInput } from '@conciergeiq/contracts';
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

  async execute(command: PlaceOrderCommand): Promise<Order> {
    const menuItems = await this.menu.findItems(
      command.hotelId,
      command.items.map((line) => line.itemId),
    );
    const items = priceOrderItems(command.items, menuItems);

    return this.unitOfWork.run(async ({ orders, recordEvent }) => {
      if (command.idempotencyKey) {
        const existing = await orders.findByIdempotencyKey(command.hotelId, command.idempotencyKey);
        if (existing) return existing;
      }

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
