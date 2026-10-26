import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UNAUTHORIZED_CLOSE_CODE } from '../../src/modules/realtime/index.js';
import { LiveDashboard } from '../support/live-dashboard.js';
import { TestWorld, type HotelFixture } from '../support/test-world.js';

describe('Staff live orders board', () => {
  let world: TestWorld;
  let hotel: HotelFixture;

  beforeAll(async () => {
    world = await TestWorld.start();
  });
  afterAll(() => world.stop());
  beforeEach(async () => {
    await world.reset();
    hotel = await world.createHotel();
  });

  const setStatus = (orderId: string, status: string, reason?: string) =>
    hotel.staff.patch(`/orders/${orderId}/status`, { status, reason });

  it('shows a new order as pending, priced from the menu', async () => {
    const { order } = await hotel.pendingOrder('214');

    const { body: board } = await hotel.staff.get('/orders');

    expect(board).toEqual([
      expect.objectContaining({
        id: order.id,
        number: order.number,
        roomNumber: '214',
        status: 'PENDING',
        totalAmount: 17_000,
        items: [expect.objectContaining({ name: 'Jollof rice 214', quantity: 2, unitPrice: 8500 })],
        payment: null,
      }),
    ]);
  });

  it('filters the board by status', async () => {
    const { order: pending } = await hotel.pendingOrder('101');
    const { order: accepted } = await hotel.pendingOrder('102');
    await setStatus(accepted.id, 'IN_PROGRESS');

    const { body: inProgress } = await hotel.staff.get('/orders', { status: 'IN_PROGRESS' });

    expect(inProgress.map((order: { id: string }) => order.id)).toEqual([accepted.id]);
    expect(inProgress.map((order: { id: string }) => order.id)).not.toContain(pending.id);
  });

  describe('accept, deliver, cancel', () => {
    it('moves an order from pending to in progress to delivered', async () => {
      const { order } = await hotel.pendingOrder();

      const accepted = await setStatus(order.id, 'IN_PROGRESS');
      const delivered = await setStatus(order.id, 'DELIVERED');

      expect(accepted.body.status).toBe('IN_PROGRESS');
      expect(delivered.body.status).toBe('DELIVERED');
    });

    it('keeps a timeline of who did what, and when', async () => {
      const { order } = await hotel.pendingOrder('101');
      world.clock.advanceMinutes(4);

      const { body: accepted } = await setStatus(order.id, 'IN_PROGRESS');

      expect(accepted.history).toEqual([
        { from: null, to: 'PENDING', changedBy: 'Guest · Room 101', changedAt: '2026-10-24T09:00:00.000Z' },
        { from: 'PENDING', to: 'IN_PROGRESS', changedBy: 'Chidi Eze', changedAt: '2026-10-24T09:04:00.000Z' },
      ]);
    });

    it('cannot skip straight from pending to delivered', async () => {
      const { order } = await hotel.pendingOrder();

      const response = await setStatus(order.id, 'DELIVERED');

      expect(response.status).toBe(409);
      expect(response.body.error.message).toBe('This order is PENDING and cannot move to DELIVERED');
    });

    it('ignores a double tap on "Accept"', async () => {
      const { order } = await hotel.pendingOrder();
      await setStatus(order.id, 'IN_PROGRESS');

      const secondTap = await setStatus(order.id, 'IN_PROGRESS');

      expect(secondTap.status).toBe(409);
      expect((await hotel.staff.get(`/orders/${order.id}`)).body.status).toBe('IN_PROGRESS');
    });

    it('needs a reason to cancel, and shows it on the card', async () => {
      const { order } = await hotel.pendingOrder();

      const withoutReason = await setStatus(order.id, 'CANCELLED');
      const withReason = await setStatus(order.id, 'CANCELLED', 'Guest changed mind');

      expect(withoutReason.status).toBe(400);
      expect(withReason.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'Guest changed mind' });
    });

    it('cannot cancel an order that was already delivered', async () => {
      const { order } = await hotel.pendingOrder();
      await hotel.acceptAndDeliver(order.id);

      const response = await setStatus(order.id, 'CANCELLED', 'Too late');

      expect(response.status).toBe(409);
    });
  });

  describe('live updates', () => {
    let dashboard: LiveDashboard;

    beforeEach(async () => {
      dashboard = await LiveDashboard.open(world.server, hotel.staff.accessToken);
    });

    it('greets the dashboard when it connects', () => {
      expect(dashboard.messages[0]).toMatchObject({
        type: 'STAFF_CONNECTED',
        payload: { userId: hotel.staff.user.id, hotelId: hotel.id },
      });
    });

    it('pushes a new order, which is when the dashboard plays its sound', async () => {
      const { order } = await hotel.pendingOrder('407');

      await world.deliverEvents();
      await dashboard.waitFor(() => dashboard.messagesOfType('NEW_ORDER_RECEIVED').length > 0);

      expect(dashboard.messagesOfType('NEW_ORDER_RECEIVED')).toEqual([
        {
          type: 'NEW_ORDER_RECEIVED',
          payload: {
            orderId: order.id,
            orderNumber: order.number,
            roomNumber: '407',
            totalAmount: 17_000,
            itemsSummary: 'Jollof rice 407 ×2',
            createdAt: world.clock.now().toISOString(),
          },
        },
      ]);
    });

    it('pushes every status change with who made it', async () => {
      const { order } = await hotel.pendingOrder();
      await setStatus(order.id, 'IN_PROGRESS');

      await world.deliverEvents();
      await dashboard.waitFor(() => dashboard.messagesOfType('ORDER_STATUS_CHANGED').length > 0);

      expect(dashboard.messagesOfType('ORDER_STATUS_CHANGED')[0]!.payload).toMatchObject({
        orderId: order.id,
        previousStatus: 'PENDING',
        newStatus: 'IN_PROGRESS',
        changedBy: 'Chidi Eze',
      });
    });

    it('signs a deactivated user out of their open dashboard', async () => {
      await hotel.admin.patch(`/users/${hotel.staff.user.id}`, { isActive: false });

      await world.deliverEvents();
      await dashboard.waitFor(() => dashboard.closeCode !== undefined);

      expect(dashboard.messagesOfType('SESSION_REVOKED')).toHaveLength(1);
    });

    it('refuses a connection without a valid access token', async () => {
      const stranger = await LiveDashboard.open(world.server, 'not-a-token');

      expect(stranger.closeCode).toBe(UNAUTHORIZED_CLOSE_CODE);
    });
  });
});
