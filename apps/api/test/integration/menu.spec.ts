import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestWorld, type HotelFixture } from '../support/test-world.js';

describe('Menu and stock', () => {
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

  it('lets a manager build the menu: categories in order, items with prices', async () => {
    const { body: drinks } = await hotel.manager.post('/menu/categories', { name: 'Drinks', sortOrder: 2 });
    const { body: mains } = await hotel.manager.post('/menu/categories', { name: 'Mains', sortOrder: 1 });
    await hotel.manager.post('/menu/items', { categoryId: mains.id, name: 'Jollof rice & grilled chicken', price: 8500 });
    await hotel.manager.post('/menu/items', { categoryId: drinks.id, name: 'Chapman', price: 2400 });

    const { body: menu } = await hotel.staff.get('/menu');

    expect(menu.categories.map((category: { name: string }) => category.name)).toEqual(['Mains', 'Drinks']);
    expect(menu.categories[0].items[0]).toMatchObject({
      name: 'Jollof rice & grilled chicken',
      price: 8500,
      isAvailable: true,
    });
  });

  it('keeps prices exact to the kobo', async () => {
    const item = await hotel.addMenuItem('Sparkling water', 1250.5);

    expect(item.price).toBe(1250.5);
  });

  it('changes a price', async () => {
    const burger = await hotel.addMenuItem('Azure club burger', 9200);

    const response = await hotel.manager.patch(`/menu/items/${burger.id}`, { price: 9800 });

    expect(response.body.price).toBe(9800);
  });

  it('refuses to delete a category that still has items', async () => {
    const burger = await hotel.addMenuItem('Azure club burger', 9200);

    const response = await hotel.manager.delete(`/menu/categories/${burger.categoryId}`);

    expect(response.status).toBe(409);
  });

  describe('one-tap "mark unavailable"', () => {
    it('lets a receptionist take an item off and put it back', async () => {
      const pasta = await hotel.addMenuItem('Seafood pasta', 11_000);

      const off = await hotel.receptionist.patch(`/menu/items/${pasta.id}/availability`, { isAvailable: false });
      const on = await hotel.receptionist.patch(`/menu/items/${pasta.id}/availability`, { isAvailable: true });

      expect(off.body.isAvailable).toBe(false);
      expect(on.body.isAvailable).toBe(true);
    });

    it('records who did it in the activity log', async () => {
      const pasta = await hotel.addMenuItem('Seafood pasta', 11_000);

      await hotel.receptionist.patch(`/menu/items/${pasta.id}/availability`, { isAvailable: false });
      await world.deliverEvents();

      const { body: activity } = await hotel.manager.get('/activity', { category: 'menu' });
      expect(activity).toEqual([
        expect.objectContaining({ detail: 'Seafood pasta → unavailable', actorName: 'Amaka Obi' }),
      ]);
    });

    it('stops guests ordering the item', async () => {
      const { stay } = await hotel.pendingOrder('101');
      const pasta = await hotel.addMenuItem('Seafood pasta', 11_000);
      await hotel.receptionist.patch(`/menu/items/${pasta.id}/availability`, { isAvailable: false });

      await expect(hotel.guestOrders(stay, [{ item: pasta }])).rejects.toThrow('Seafood pasta is not available right now');
    });
  });

  it('does not let a receptionist edit prices or kitchen staff hide items', async () => {
    const burger = await hotel.addMenuItem('Azure club burger', 9200);

    const priceChange = await hotel.receptionist.patch(`/menu/items/${burger.id}`, { price: 1 });
    const hide = await hotel.staff.patch(`/menu/items/${burger.id}/availability`, { isAvailable: false });

    expect(priceChange.status).toBe(403);
    expect(hide.status).toBe(403);
  });
});
