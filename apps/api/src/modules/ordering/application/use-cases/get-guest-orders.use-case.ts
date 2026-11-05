/**
 * WHAT IT DOES:
 * Query use cases for guest order retrieval and tracking:
 * - `GetGuestOrdersUseCase`: Retrieves all active and historical orders for the current guest stay.
 * - `GetGuestOrderDetailUseCase`: Retrieves single order details for a specific order belonging to the guest's stay.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Guest-stay boundary enforcement: strictly scopes queries to `hotelId` and `stayId` from verified session claims.
 * - Multi-tenant isolation: ensures a guest from Room 101 cannot view or track orders from Room 102 or another hotel.
 * - Throws `NotFoundError('Order')` when an order does not exist or does not belong to the guest's stay,
 *   preventing timing attacks or ID enumeration leaks.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import type { OrderResponse } from '@conciergeiq/contracts';
import { NotFoundError } from '../../../../shared/errors/app-error.js';
import type { OrderReadModel } from '../ports/order-read-model.port.js';

export interface GetGuestOrdersQuery {
  readonly hotelId: string;
  readonly stayId: string;
}

export interface GetGuestOrderDetailQuery {
  readonly hotelId: string;
  readonly stayId: string;
  readonly orderId: string;
}

export class GetGuestOrdersUseCase {
  constructor(private readonly orders: OrderReadModel) {}

  public execute = async ({
    hotelId,
    stayId,
  }: GetGuestOrdersQuery): Promise<OrderResponse[]> => {
    return this.orders.listByStay(hotelId, stayId);
  };

  public getOrderDetail = async ({
    hotelId,
    stayId,
    orderId,
  }: GetGuestOrderDetailQuery): Promise<OrderResponse> => {
    const foundOrder = await this.orders.getByStay(hotelId, stayId, orderId);
    if (!foundOrder) {
      throw new NotFoundError('Order');
    }
    return foundOrder;
  };
}

export class GetGuestOrderDetailUseCase {
  constructor(private readonly orders: OrderReadModel) {}

  public execute = async (
    query: GetGuestOrderDetailQuery
  ): Promise<OrderResponse> => {
    const foundOrder = await this.orders.getByStay(
      query.hotelId,
      query.stayId,
      query.orderId
    );
    if (!foundOrder) {
      throw new NotFoundError('Order');
    }
    return foundOrder;
  };
}
