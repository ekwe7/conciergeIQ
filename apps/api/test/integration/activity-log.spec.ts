import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestWorld, type HotelFixture } from '../support/test-world.js';

describe('Activity log', () => {
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

  /** Activity as the manager sees it, oldest first, as "event: detail (actor)". */
  async function activityLines(query: Record<string, string> = {}): Promise<string[]> {
    await world.deliverEvents();
    const { body } = await hotel.manager.get('/activity', query);
    return body
      .reverse()
      .map((entry: { eventName: string; detail: string; actorName: string }) => `${entry.eventName}: ${entry.detail} (${entry.actorName})`);
  }

  it('records who did what across a whole stay', async () => {
    const { order, stay } = await hotel.pendingOrder('101');
    await hotel.acceptAndDeliver(order.id);
    await hotel.receptionist.post(`/orders/${order.id}/payments`, { method: 'CARD' });
    await hotel.receptionist.post(`/stays/${stay.id}/check-out`);

    expect(await activityLines()).toEqual([
      'stay.checked_in: Room 101 · Mr. Bello (Amaka Obi)',
      `order.created: A-${order.number} · Room 101 · ₦17,000 (Guest · Room 101)`,
      `order.status_changed: A-${order.number} → IN_PROGRESS (Chidi Eze)`,
      `order.status_changed: A-${order.number} → DELIVERED (Chidi Eze)`,
      `payment.recorded: A-${order.number} · ₦17,000 · Card (Amaka Obi)`,
      'stay.checked_out: Room 101 · Mr. Bello (Amaka Obi)',
    ]);
  });

  it('records staff deactivation and QR code regeneration', async () => {
    const room = await hotel.addRoom('103');
    await hotel.admin.post(`/rooms/${room.id}/qr/regenerate`);
    await hotel.admin.patch(`/users/${hotel.staff.user.id}`, { isActive: false });

    expect(await activityLines()).toEqual([
      'room.qr_regenerated: Room 103 (Emmanuel Ekwe)',
      'user.deactivated: Chidi Eze (Emmanuel Ekwe)',
    ]);
  });

  it('filters by category and by staff member', async () => {
    const { order } = await hotel.pendingOrder('101');
    await hotel.acceptAndDeliver(order.id);
    await hotel.receptionist.post(`/orders/${order.id}/payments`, { method: 'CASH' });

    expect(await activityLines({ category: 'payments' })).toHaveLength(1);
    expect(await activityLines({ actorId: hotel.staff.user.id })).toHaveLength(2);
  });

  it('logs each event once, even if it is delivered again', async () => {
    await hotel.pendingOrder('101');
    await world.deliverEvents();

    await world.redeliverAllEvents();

    expect(await activityLines()).toHaveLength(2);
  });

  it('exports the log as CSV', async () => {
    await hotel.pendingOrder('101');
    await world.deliverEvents();

    const response = await hotel.manager.get('/activity.csv');

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.body.split('\n')[0]).toBe('Time,Event,Detail,Actor');
  });
});
