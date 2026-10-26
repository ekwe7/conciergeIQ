import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestWorld, type HotelFixture } from '../support/test-world.js';

describe('Mark as paid', () => {
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

  async function deliveredOrder(roomNumber = '205') {
    const { order } = await hotel.pendingOrder(roomNumber);
    await hotel.acceptAndDeliver(order.id);
    return order;
  }

  it('records the full order total, the method and who took it', async () => {
    const order = await deliveredOrder();

    const response = await hotel.receptionist.post(`/orders/${order.id}/payments`, { method: 'CARD', reference: 'POS-8841' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      orderId: order.id,
      orderNumber: order.number,
      roomNumber: '205',
      amount: 17_000,
      method: 'CARD',
      reference: 'POS-8841',
      recordedBy: 'Amaka Obi',
    });
  });

  it('shows the order as paid on the live board', async () => {
    const order = await deliveredOrder();

    await hotel.receptionist.post(`/orders/${order.id}/payments`, { method: 'CASH' });
    await world.deliverEvents();

    const { body: card } = await hotel.staff.get(`/orders/${order.id}`);
    expect(card.payment).toEqual({ method: 'CASH', paidAt: world.clock.now().toISOString() });
  });

  it('cannot record the same order twice', async () => {
    const order = await deliveredOrder();
    await hotel.receptionist.post(`/orders/${order.id}/payments`, { method: 'CASH' });

    const secondTime = await hotel.receptionist.post(`/orders/${order.id}/payments`, { method: 'CASH' });

    expect(secondTime.status).toBe(409);
  });

  it('cannot take payment for an order nobody has accepted, or one that was cancelled', async () => {
    const { order: pending } = await hotel.pendingOrder('101');
    const { order: cancelled } = await hotel.pendingOrder('102');
    await hotel.staff.patch(`/orders/${cancelled.id}/status`, { status: 'CANCELLED', reason: 'Guest changed mind' });

    const forPending = await hotel.receptionist.post(`/orders/${pending.id}/payments`, { method: 'CASH' });
    const forCancelled = await hotel.receptionist.post(`/orders/${cancelled.id}/payments`, { method: 'CASH' });

    expect(forPending.body.error.message).toBe('Accept the order before recording a payment');
    expect(forCancelled.body.error.message).toBe('A cancelled order cannot be paid');
  });

  it('has nothing to collect for a free amenity', async () => {
    const room = await hotel.addRoom('318');
    const stay = await hotel.checkIn(room);
    const towels = await hotel.addMenuItem('Extra towels', 0, 'Amenities');
    const order = await hotel.guestOrders(stay, [{ item: towels, quantity: 2 }]);
    await hotel.acceptAndDeliver(order.id);

    const response = await hotel.receptionist.post(`/orders/${order.id}/payments`, { method: 'CASH' });

    expect(response.body.error.message).toBe('This order has no charge');
  });

  it('does not let kitchen staff record payments', async () => {
    const order = await deliveredOrder();

    const response = await hotel.staff.post(`/orders/${order.id}/payments`, { method: 'CASH' });

    expect(response.status).toBe(403);
  });

  describe('the payments screen', () => {
    it('totals what was collected by method, and what delivered orders still owe', async () => {
      const paidByCard = await deliveredOrder('101');
      const paidInCash = await deliveredOrder('102');
      const unpaid = await deliveredOrder('103');
      await hotel.receptionist.post(`/orders/${paidByCard.id}/payments`, { method: 'CARD' });
      await hotel.receptionist.post(`/orders/${paidInCash.id}/payments`, { method: 'CASH' });
      await world.deliverEvents();

      const { body: summary } = await hotel.receptionist.get('/payments/summary');
      const { body: outstanding } = await hotel.receptionist.get('/payments/outstanding');

      expect(summary).toEqual({
        collected: { total: 34_000, count: 2 },
        byMethod: { CASH: 17_000, CARD: 17_000, TRANSFER: 0 },
        outstanding: { total: 17_000, count: 1 },
      });
      expect(outstanding).toEqual([
        { orderId: unpaid.id, orderNumber: unpaid.number, roomNumber: '103', amount: 17_000 },
      ]);
    });

    it('lists payments newest first', async () => {
      const first = await deliveredOrder('101');
      const second = await deliveredOrder('102');
      await hotel.receptionist.post(`/orders/${first.id}/payments`, { method: 'CARD' });
      world.clock.advanceMinutes(5);
      await hotel.receptionist.post(`/orders/${second.id}/payments`, { method: 'TRANSFER' });

      const { body: payments } = await hotel.receptionist.get('/payments');

      expect(payments.map((payment: { roomNumber: string }) => payment.roomNumber)).toEqual(['102', '101']);
    });
  });
});
