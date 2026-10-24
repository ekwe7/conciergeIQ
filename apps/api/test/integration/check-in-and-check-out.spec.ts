import type { Room } from '@conciergeiq/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestWorld, type HotelFixture } from '../support/test-world.js';

describe('Check-in and check-out', () => {
  let world: TestWorld;
  let hotel: HotelFixture;
  let room: Room;

  beforeAll(async () => {
    world = await TestWorld.start();
  });
  afterAll(() => world.stop());
  beforeEach(async () => {
    await world.reset();
    hotel = await world.createHotel();
    room = await hotel.addRoom('102');
  });

  const checkIn = (guestName = 'Mrs. Funke Adebayo') =>
    hotel.receptionist.post(`/rooms/${room.id}/check-in`, {
      guestName,
      expectedCheckOutAt: world.clock.daysFromNow(3),
      guestPhone: '+2348012345678',
    });

  it('starts a stay for the room', async () => {
    const response = await checkIn();

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      roomId: room.id,
      roomNumber: '102',
      guestName: 'Mrs. Funke Adebayo',
      checkedInAt: world.clock.now().toISOString(),
      checkedOutAt: null,
    });
  });

  it('shows the stay among the active stays', async () => {
    await checkIn();

    const { body: stays } = await hotel.receptionist.get('/stays');

    expect(stays.map((stay: { roomNumber: string }) => stay.roomNumber)).toEqual(['102']);
  });

  it('does not check a second guest into an occupied room', async () => {
    await checkIn();

    const response = await checkIn('Someone Else');

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe('Room 102 already has a guest checked in');
  });

  it('does not check anyone into a room that is out of order', async () => {
    await hotel.admin.patch(`/rooms/${room.id}`, { isOutOfOrder: true, outOfOrderReason: 'AC repair' });

    const response = await checkIn();

    expect(response.status).toBe(409);
  });

  it('needs a departure in the future', async () => {
    const response = await hotel.receptionist.post(`/rooms/${room.id}/check-in`, {
      guestName: 'Mr. Bello',
      expectedCheckOutAt: '2020-01-01T12:00:00.000Z',
    });

    expect(response.status).toBe(409);
  });

  it('ends the stay and frees the room for the next guest', async () => {
    const { body: stay } = await checkIn();
    world.clock.advanceMinutes(60);

    const checkOut = await hotel.receptionist.post(`/stays/${stay.id}/check-out`);
    const nextGuest = await checkIn('Next Guest');

    expect(checkOut.body.checkedOutAt).toBe(world.clock.now().toISOString());
    expect(nextGuest.status).toBe(201);
    expect((await hotel.receptionist.get('/stays')).body).toHaveLength(1);
  });

  it('announces check-out so guest sessions for the room can end immediately', async () => {
    const { body: stay } = await checkIn();

    await hotel.receptionist.post(`/stays/${stay.id}/check-out`);
    await world.deliverEvents();

    const { body: activity } = await hotel.manager.get('/activity', { category: 'stays' });
    expect(activity.map((entry: { eventName: string }) => entry.eventName)).toEqual([
      'stay.checked_out',
      'stay.checked_in',
    ]);
  });

  it('cannot check the same stay out twice', async () => {
    const { body: stay } = await checkIn();
    await hotel.receptionist.post(`/stays/${stay.id}/check-out`);

    const again = await hotel.receptionist.post(`/stays/${stay.id}/check-out`);

    expect(again.status).toBe(409);
  });

  describe('the bill shown before check-out', () => {
    it('totals orders, payments and what is still open', async () => {
      const { body: stay } = await checkIn('Mr. Lawal');
      const pepperSoup = await hotel.addMenuItem('Pepper soup', 12_200);
      const breakfast = await hotel.addMenuItem('Breakfast', 9_000);

      const paidOrder = await hotel.guestOrders(stay, [{ item: breakfast, quantity: 2 }]);
      await hotel.acceptAndDeliver(paidOrder.id);
      await hotel.receptionist.post(`/orders/${paidOrder.id}/payments`, { method: 'CARD' });
      const openOrder = await hotel.guestOrders(stay, [{ item: pepperSoup }]);
      await hotel.staff.patch(`/orders/${openOrder.id}/status`, { status: 'IN_PROGRESS' });
      await world.deliverEvents();

      const { body: bill } = await hotel.receptionist.get(`/stays/${stay.id}/bill`);

      expect(bill).toEqual({
        stayId: stay.id,
        ordersCount: 2,
        totalCharged: 30_200,
        totalPaid: 18_000,
        outstanding: 12_200,
        openOrders: [
          { orderId: openOrder.id, orderNumber: openOrder.number, status: 'IN_PROGRESS', itemsSummary: 'Pepper soup' },
        ],
      });
    });

    it('still lets the receptionist check out with an open order', async () => {
      const { body: stay } = await checkIn();
      const water = await hotel.addMenuItem('Water', 500);
      await hotel.guestOrders(stay, [{ item: water }]);

      const response = await hotel.receptionist.post(`/stays/${stay.id}/check-out`);

      expect(response.status).toBe(200);
    });
  });

  it('does not let kitchen staff check guests in', async () => {
    const response = await hotel.staff.post(`/rooms/${room.id}/check-in`, {
      guestName: 'Mr. Bello',
      expectedCheckOutAt: world.clock.daysFromNow(1),
    });

    expect(response.status).toBe(403);
  });
});
