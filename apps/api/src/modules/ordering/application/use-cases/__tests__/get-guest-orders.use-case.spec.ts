/**
 * WHAT IT DOES:
 * Unit test suite for `GetGuestOrdersUseCase` and `GetGuestOrderDetailUseCase`.
 * Verifies strict tenant isolation and stay boundary enforcement for guest order queries.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Tests that a guest can only retrieve orders strictly associated with their `hotelId` and `stayId`.
 * - Asserts that attempting to query an order belonging to another room or another hotel throws `NotFoundError`.
 * - Confirms that order lists are returned in newest-first order with ISO 8601 timestamps and items.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { OrderStatus, type OrderResponse } from '@conciergeiq/contracts';
import { NotFoundError } from '../../../../../shared/errors/app-error.js';
import type { OrderReadModel } from '../../ports/order-read-model.port.js';
import {
  GetGuestOrdersUseCase,
  GetGuestOrderDetailUseCase,
} from '../get-guest-orders.use-case.js';

class MockOrderReadModel implements OrderReadModel {
  public storedOrders: OrderResponse[] = [];

  public list = async (): Promise<OrderResponse[]> => {
    return [...this.storedOrders];
  };

  public get = async (
    hotelId: string,
    orderId: string
  ): Promise<OrderResponse | undefined> => {
    return this.storedOrders.find(
      (order) => order.id === orderId && (order as { hotelId?: string }).hotelId === hotelId
    );
  };

  public findPaymentFacts = async (): Promise<undefined> => undefined;

  public listDeliveredUnpaid = async (): Promise<[]> => [];

  public summarizeStay = async (): Promise<never> => {
    throw new Error('Not implemented for this mock');
  };

  public listByStay = async (
    hotelId: string,
    stayId: string
  ): Promise<OrderResponse[]> => {
    return this.storedOrders
      .filter(
        (order) =>
          (order as { hotelId?: string }).hotelId === hotelId && order.stayId === stayId
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  };

  public getByStay = async (
    hotelId: string,
    stayId: string,
    orderId: string
  ): Promise<OrderResponse | undefined> => {
    return this.storedOrders.find(
      (order) =>
        (order as { hotelId?: string }).hotelId === hotelId &&
        order.stayId === stayId &&
        order.id === orderId
    );
  };
}

describe('GetGuestOrdersUseCase & Boundary Security', () => {
  let mockReadModel: MockOrderReadModel;
  let getGuestOrdersUseCase: GetGuestOrdersUseCase;
  let getGuestOrderDetailUseCase: GetGuestOrderDetailUseCase;

  const HOTEL_ALPHA = 'hotel-alpha';
  const HOTEL_BETA = 'hotel-beta';

  const STAY_ROOM_101 = 'stay-101';
  const STAY_ROOM_102 = 'stay-102';

  const orderStay101Earlier: OrderResponse = {
    id: 'ord-101-earlier',
    number: 1001,
    roomId: 'room-101',
    roomNumber: '101',
    stayId: STAY_ROOM_101,
    status: OrderStatus.DELIVERED,
    items: [
      {
        itemId: 'item-coffee',
        name: 'Espresso',
        quantity: 1,
        unitPrice: 4.5,
      },
    ],
    totalAmount: 4.5,
    cancelReason: null,
    payment: null,
    history: [],
    createdAt: '2026-10-29T08:00:00.000Z',
    updatedAt: '2026-10-29T08:30:00.000Z',
    ...({ hotelId: HOTEL_ALPHA } as unknown as object),
  };

  const orderStay101Later: OrderResponse = {
    id: 'ord-101-later',
    number: 1002,
    roomId: 'room-101',
    roomNumber: '101',
    stayId: STAY_ROOM_101,
    status: OrderStatus.IN_PROGRESS,
    items: [
      {
        itemId: 'item-club-sandwich',
        name: 'Club Sandwich',
        quantity: 2,
        unitPrice: 15.0,
        notes: 'Toasted rye',
      },
    ],
    totalAmount: 30.0,
    cancelReason: null,
    payment: null,
    history: [],
    createdAt: '2026-10-29T12:00:00.000Z',
    updatedAt: '2026-10-29T12:15:00.000Z',
    ...({ hotelId: HOTEL_ALPHA } as unknown as object),
  };

  const orderStay102OtherRoom: OrderResponse = {
    id: 'ord-102-other-room',
    number: 1003,
    roomId: 'room-102',
    roomNumber: '102',
    stayId: STAY_ROOM_102,
    status: OrderStatus.PENDING,
    items: [
      {
        itemId: 'item-pizza',
        name: 'Margherita Pizza',
        quantity: 1,
        unitPrice: 20.0,
      },
    ],
    totalAmount: 20.0,
    cancelReason: null,
    payment: null,
    history: [],
    createdAt: '2026-10-29T12:30:00.000Z',
    updatedAt: '2026-10-29T12:30:00.000Z',
    ...({ hotelId: HOTEL_ALPHA } as unknown as object),
  };

  const orderHotelBeta: OrderResponse = {
    id: 'ord-beta-hotel',
    number: 5001,
    roomId: 'room-beta-1',
    roomNumber: '1',
    stayId: 'stay-beta-1',
    status: OrderStatus.PENDING,
    items: [
      {
        itemId: 'item-burger',
        name: 'Burger',
        quantity: 1,
        unitPrice: 18.0,
      },
    ],
    totalAmount: 18.0,
    cancelReason: null,
    payment: null,
    history: [],
    createdAt: '2026-10-29T13:00:00.000Z',
    updatedAt: '2026-10-29T13:00:00.000Z',
    ...({ hotelId: HOTEL_BETA } as unknown as object),
  };

  beforeEach(() => {
    mockReadModel = new MockOrderReadModel();
    mockReadModel.storedOrders = [
      orderStay101Earlier,
      orderStay101Later,
      orderStay102OtherRoom,
      orderHotelBeta,
    ];

    getGuestOrdersUseCase = new GetGuestOrdersUseCase(mockReadModel);
    getGuestOrderDetailUseCase = new GetGuestOrderDetailUseCase(mockReadModel);
  });

  describe('GetGuestOrdersUseCase.execute', () => {
    it('returns only orders belonging to the specified hotel and stay, sorted newest first', async () => {
      const orders = await getGuestOrdersUseCase.execute({
        hotelId: HOTEL_ALPHA,
        stayId: STAY_ROOM_101,
      });

      expect(orders).toHaveLength(2);
      expect(orders[0]?.id).toBe('ord-101-later'); // Newest first (12:00Z)
      expect(orders[1]?.id).toBe('ord-101-earlier'); // Earlier (08:00Z)
    });

    it('returns an empty array when the stay has no orders', async () => {
      const orders = await getGuestOrdersUseCase.execute({
        hotelId: HOTEL_ALPHA,
        stayId: 'stay-without-orders',
      });

      expect(orders).toEqual([]);
    });

    it('does not leak orders across different hotels even with identical stay ids', async () => {
      const orders = await getGuestOrdersUseCase.execute({
        hotelId: 'different-hotel',
        stayId: STAY_ROOM_101,
      });

      expect(orders).toEqual([]);
    });
  });

  describe('GetGuestOrdersUseCase.getOrderDetail & Boundary Isolation', () => {
    it('retrieves order details when hotelId, stayId, and orderId match', async () => {
      const order = await getGuestOrdersUseCase.getOrderDetail({
        hotelId: HOTEL_ALPHA,
        stayId: STAY_ROOM_101,
        orderId: 'ord-101-later',
      });

      expect(order.id).toBe('ord-101-later');
      expect(order.roomNumber).toBe('101');
      expect(order.totalAmount).toBe(30.0);
      expect(order.items[0]?.name).toBe('Club Sandwich');
    });

    it('throws NotFoundError if the order belongs to another room/stay in the same hotel', async () => {
      // Stay 101 guest trying to view Stay 102 order (valid order ID in same hotel)
      await expect(
        getGuestOrdersUseCase.getOrderDetail({
          hotelId: HOTEL_ALPHA,
          stayId: STAY_ROOM_101,
          orderId: 'ord-102-other-room',
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError if the order belongs to another hotel', async () => {
      await expect(
        getGuestOrdersUseCase.getOrderDetail({
          hotelId: HOTEL_ALPHA,
          stayId: STAY_ROOM_101,
          orderId: 'ord-beta-hotel',
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError if the orderId does not exist at all', async () => {
      await expect(
        getGuestOrdersUseCase.getOrderDetail({
          hotelId: HOTEL_ALPHA,
          stayId: STAY_ROOM_101,
          orderId: 'ord-non-existent',
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('works identically via GetGuestOrderDetailUseCase', async () => {
      const order = await getGuestOrderDetailUseCase.execute({
        hotelId: HOTEL_ALPHA,
        stayId: STAY_ROOM_101,
        orderId: 'ord-101-earlier',
      });

      expect(order.id).toBe('ord-101-earlier');

      await expect(
        getGuestOrderDetailUseCase.execute({
          hotelId: HOTEL_ALPHA,
          stayId: STAY_ROOM_101,
          orderId: 'ord-102-other-room',
        })
      ).rejects.toThrow(NotFoundError);
    });
  });
});
