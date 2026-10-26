import type { OrderResponse, OrderStatus } from '@conciergeiq/contracts';
import type { Clock } from '../../../../shared/utils/clock.js';
import type { OrderReadModel } from '../ports/order-read-model.port.js';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface ListHotelOrdersQuery {
  hotelId: string;
  status?: OrderStatus;
  /** Defaults to the last 24 hours, which covers a full shift on the live board. */
  since?: Date;
}

export class ListHotelOrdersUseCase {
  constructor(
    private readonly orders: OrderReadModel,
    private readonly clock: Clock,
  ) {}

  execute({ hotelId, status, since }: ListHotelOrdersQuery): Promise<OrderResponse[]> {
    const oneDayAgo = new Date(this.clock.now().getTime() - DAY_IN_MS);
    return this.orders.list(hotelId, { status, since: since ?? oneDayAgo });
  }
}
