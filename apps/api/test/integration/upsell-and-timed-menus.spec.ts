import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestWorld, type HotelFixture } from '../support/test-world.js';

/** The test clock starts at 09:00 UTC, which is 10:00 in Lagos. */
describe('Upsell and timed menus', () => {
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

  const categoryOf = async (name: string) =>
    (await hotel.manager.get('/menu')).body.categories.find((category: { name: string }) => category.name === name);

  it('saves breakfast hours and says whether the category is being served', async () => {
    const pancakes = await hotel.addMenuItem('Pancakes', 3000, 'Breakfast');
    const breakfast = await categoryOf('Breakfast');

    const response = await hotel.manager.patch(`/menu/categories/${breakfast.id}`, { availableFrom: '06:30', availableUntil: '11:00' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ availableFrom: '06:30', availableUntil: '11:00', isOpenNow: true }));

    world.clock.advanceMinutes(90); // 11:30 in Lagos
    expect(await categoryOf('Breakfast')).toEqual(expect.objectContaining({ isOpenNow: false }));
    expect((await categoryOf('Breakfast')).items[0].id).toBe(pancakes.id);
  });

  it('refuses orders for a category outside its hours', async () => {
    const room = await hotel.addRoom('101');
    const stay = await hotel.checkIn(room);
    const pancakes = await hotel.addMenuItem('Pancakes', 3000, 'Breakfast');
    const breakfast = await categoryOf('Breakfast');
    await hotel.manager.patch(`/menu/categories/${breakfast.id}`, { availableFrom: '06:30', availableUntil: '11:00' });

    world.clock.advanceMinutes(90);
    await expect(hotel.guestOrders(stay, [{ item: pancakes }])).rejects.toThrow('Pancakes is not available right now');

    world.clock.advanceMinutes(20 * 60); // 07:30 the next morning
    await expect(hotel.guestOrders(stay, [{ item: pancakes }])).resolves.toEqual(expect.objectContaining({ status: 'PENDING' }));
  });

  it('serves late-night hours across midnight', async () => {
    await hotel.addMenuItem('Suya', 4000, 'Late night');
    const lateNight = await categoryOf('Late night');
    await hotel.manager.patch(`/menu/categories/${lateNight.id}`, { availableFrom: '22:00', availableUntil: '02:00' });
    expect((await categoryOf('Late night')).isOpenNow).toBe(false);

    world.clock.advanceMinutes(14 * 60 + 30); // 00:30 in Lagos
    expect((await categoryOf('Late night')).isOpenNow).toBe(true);
  });

  it('checks hours come in pairs', async () => {
    await hotel.addMenuItem('Pancakes', 3000, 'Breakfast');
    const breakfast = await categoryOf('Breakfast');
    const response = await hotel.manager.patch(`/menu/categories/${breakfast.id}`, { availableFrom: '06:30', availableUntil: null });
    expect(response.status).toBe(400);
    expect((await hotel.manager.patch(`/menu/categories/${breakfast.id}`, { availableFrom: '6.30' })).status).toBe(400);
  });

  it('features items and suggests drinks with them', async () => {
    const jollof = await hotel.addMenuItem('Jollof rice', 8500);
    const chapman = await hotel.addMenuItem('Chapman', 2400, 'Drinks');
    const water = await hotel.addMenuItem('Water', 500, 'Drinks');

    const response = await hotel.manager.patch(`/menu/items/${jollof.id}`, { isFeatured: true, pairsWith: [chapman.id, water.id] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ isFeatured: true, pairsWith: [chapman.id, water.id] }));
  });

  it('only suggests items from the same menu, never the item itself', async () => {
    const jollof = await hotel.addMenuItem('Jollof rice', 8500);
    const otherHotel = await world.createHotel('Other Hotel');
    const theirs = await otherHotel.addMenuItem('Their drink', 1000, 'Drinks');

    expect((await hotel.manager.patch(`/menu/items/${jollof.id}`, { pairsWith: [theirs.id] })).status).toBe(400);
    expect((await hotel.manager.patch(`/menu/items/${jollof.id}`, { pairsWith: [jollof.id] })).status).toBe(400);
  });

  it('gives guests their language, open categories first, featured on top, and only orderable suggestions', async () => {
    await world.app.modules.hotels.hotels.updateBranding(hotel.id, { languages: ['en', 'fr'] });
    const pancakes = await hotel.addMenuItem('Pancakes', 3000, 'Breakfast');
    const jollof = await hotel.addMenuItem('Jollof rice', 8500, 'Mains');
    const chapman = await hotel.addMenuItem('Chapman', 2400, 'Drinks');
    const water = await hotel.addMenuItem('Water', 500, 'Drinks');
    const breakfast = await categoryOf('Breakfast');
    const drinks = await categoryOf('Drinks');
    await hotel.manager.patch(`/menu/categories/${breakfast.id}`, { availableFrom: '06:30', availableUntil: '09:00' });
    await hotel.manager.patch(`/menu/categories/${drinks.id}`, { translations: { fr: { name: 'Boissons' } } });
    await hotel.manager.patch(`/menu/items/${water.id}`, { translations: { fr: { name: 'Eau' } } });
    await hotel.manager.patch(`/menu/items/${jollof.id}`, { isFeatured: true, pairsWith: [chapman.id, water.id] });
    await hotel.manager.patch(`/menu/items/${pancakes.id}`, { isFeatured: true });
    await hotel.receptionist.patch(`/menu/items/${chapman.id}/availability`, { isAvailable: false });

    const menu = await world.app.modules.menu.menu.getGuestMenu(hotel.id, 'fr');

    expect(menu.language).toBe('fr');
    expect(menu.featured.map((item) => item.name)).toEqual(['Jollof rice']);
    expect(menu.featured[0].pairsWith).toEqual([water.id]);
    expect(menu.categories.map((category) => [category.name, category.isOpenNow])).toEqual([
      ['Boissons', true],
      ['Mains', true],
      ['Breakfast', false],
    ]);
    const drinksForGuest = menu.categories.find((category) => category.id === drinks.id)!;
    expect(drinksForGuest.items.map((item) => [item.name, item.isAvailable])).toEqual([
      ['Chapman', false],
      ['Eau', true],
    ]);
  });
});
