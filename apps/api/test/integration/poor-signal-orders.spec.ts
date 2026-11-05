import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestWorld, type HotelFixture } from '../support/test-world.js';

/**
 * A phone on a weak signal sends an order, loses the reply and sends it
 * again, sometimes much later and sometimes twice at once. The order must be
 * created exactly once, and the retry must get that order back.
 */
describe('Orders sent from a poor connection', () => {
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

  const setUp = async () => {
    const room = await hotel.addRoom('101');
    const stay = await hotel.checkIn(room);
    const pancakes = await hotel.addMenuItem('Pancakes', 3000, 'Breakfast');
    return { stay, pancakes };
  };

  it('returns the same order when the same send is retried', async () => {
    const { stay, pancakes } = await setUp();
    const first = await hotel.guestOrders(stay, [{ item: pancakes }], 'cart-7f3a');
    const retry = await hotel.guestOrders(stay, [{ item: pancakes }], 'cart-7f3a');

    expect(retry.id).toBe(first.id);
    expect((await hotel.staff.get('/orders')).body).toHaveLength(1);
  });

  it('returns the order even if the item became unavailable before the retry arrived', async () => {
    const { stay, pancakes } = await setUp();
    const first = await hotel.guestOrders(stay, [{ item: pancakes }], 'cart-late');
    await hotel.receptionist.patch(`/menu/items/${pancakes.id}/availability`, { isAvailable: false });

    const retry = await hotel.guestOrders(stay, [{ item: pancakes }], 'cart-late');

    expect(retry.id).toBe(first.id);
  });

  it('creates one order when two retries arrive at the same moment', async () => {
    const { stay, pancakes } = await setUp();

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => hotel.guestOrders(stay, [{ item: pancakes }], 'cart-burst')),
    );

    const ids = results.map((result) => (result.status === 'fulfilled' ? result.value.id : String(result.reason)));
    expect(new Set(ids).size).toBe(1);
    expect((await hotel.staff.get('/orders')).body).toHaveLength(1);
  });
});
