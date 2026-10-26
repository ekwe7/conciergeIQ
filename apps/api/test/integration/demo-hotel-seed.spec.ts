import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, seedDemoHotel } from '../../db/seeds/demo-hotel.seed.js';
import { TestWorld } from '../support/test-world.js';

describe('Demo hotel seed', () => {
  let world: TestWorld;

  beforeAll(async () => {
    world = await TestWorld.start();
    await world.reset();
    await seedDemoHotel(world.app);
    await world.deliverEvents();
  });
  afterAll(() => world.stop());

  it('signs in with each demo account', async () => {
    for (const email of ['admin', 'manager', 'reception', 'kitchen'].map((name) => `${name}@demo-hotel.test`)) {
      await expect(world.signIn(email, DEMO_PASSWORD)).resolves.toBeDefined();
    }
  });

  it('fills every column of the live board', async () => {
    const kitchen = await world.signIn('kitchen@demo-hotel.test', DEMO_PASSWORD);

    const { body: orders } = await kitchen.get('/orders');

    const statuses = new Set(orders.map((order: { status: string }) => order.status));
    expect(statuses).toEqual(new Set(['PENDING', 'IN_PROGRESS', 'DELIVERED', 'CANCELLED']));
  });

  it('has something to collect and something already paid', async () => {
    const reception = await world.signIn('reception@demo-hotel.test', DEMO_PASSWORD);

    const { body: summary } = await reception.get('/payments/summary');

    expect(summary.collected.count).toBe(1);
    expect(summary.outstanding.count).toBe(1);
  });

  it('gives the activity log a story to show', async () => {
    const manager = await world.signIn('manager@demo-hotel.test', DEMO_PASSWORD);

    const { body: activity } = await manager.get('/activity');

    expect(activity.length).toBeGreaterThan(20);
  });
});
